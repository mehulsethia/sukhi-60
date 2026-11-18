-- WhatsApp-first interface: people can use Sukhi entirely on WhatsApp (no app install).
-- Adds conversation state on the binding, interactive outbound messages, doctors who follow
-- their patients' adherence (with the patient's consent), and doctor rewards.
-- All new tables are service-role only: every read and write goes through server code that
-- has verified the WhatsApp binding (or the web session).

-- 1. Conversation state (what the next free-text reply means: a name, a code, a note...).
alter table public.channel_bindings
  add column if not exists wa_state text check (char_length(wa_state) <= 40),
  add column if not exists wa_state_data jsonb not null default '{}'::jsonb,
  add column if not exists wa_state_at timestamptz;

-- 2. Interactive (buttons / list / image) outbound messages keep their Graph payload.
alter table public.outbound_messages drop constraint if exists outbound_messages_kind_check;
alter table public.outbound_messages add constraint outbound_messages_kind_check check (kind in ('free_text', 'template', 'interactive'));
alter table public.outbound_messages add column if not exists payload jsonb;

-- 3. Where the account started and what the WhatsApp menu leads with.
alter table public.profiles
  add column if not exists signup_channel text not null default 'web' check (signup_channel in ('web', 'whatsapp')),
  add column if not exists primary_role text not null default 'patient' check (primary_role in ('patient', 'family', 'doctor'));

-- 4. Doctors. Self-registered on WhatsApp for the pilot (shown to patients as "as they told us").
create table if not exists public.doctors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  clinic text check (char_length(clinic) <= 120),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  reward_text text check (char_length(reward_text) <= 160),
  reward_target_pct int not null default 80 check (reward_target_pct between 50 and 100),
  reward_days int not null default 30 check (reward_days between 7 and 120),
  created_at timestamptz not null default now()
);

-- 5. Patient <-> doctor link. The patient explicitly agrees to share adherence (not chats).
create table if not exists public.doctor_patients (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (user_id) on delete cascade,
  patient_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- Start of the current reward period (advances after each completed period).
  period_start date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at timestamptz not null default now(),
  check (doctor_id <> patient_id)
);
create unique index if not exists doctor_patients_pair on public.doctor_patients (doctor_id, patient_id);
create index if not exists doctor_patients_patient on public.doctor_patients (patient_id, status);

-- 6. Rewards a patient earned from their doctor (shown at the clinic as a short code).
create table if not exists public.doctor_rewards (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.doctor_patients (id) on delete cascade,
  doctor_id uuid not null references public.doctors (user_id) on delete cascade,
  patient_id uuid not null references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  reward_text text not null check (char_length(reward_text) <= 160),
  adherence_pct int not null check (adherence_pct between 0 and 100),
  period_start date not null,
  period_end date not null,
  status text not null default 'earned' check (status in ('earned', 'redeemed')),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (link_id, period_start)
);
create index if not exists doctor_rewards_doctor on public.doctor_rewards (doctor_id, status);

do $$
declare t text;
begin
  foreach t in array array['doctors', 'doctor_patients', 'doctor_rewards'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
