-- A patient invites their own doctor (CARE-XXXXXX). Creating the invite is the patient's
-- consent to share adherence with whichever doctor accepts it. One open invite per patient.
create table if not exists public.care_invites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique,
  status text not null default 'open' check (status in ('open', 'claimed', 'accepted', 'revoked')),
  -- Set when a new number taps Start on the invite; the link is made once their doctor profile exists.
  doctor_user_id uuid references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (doctor_user_id is null or doctor_user_id <> patient_id)
);
create index if not exists care_invites_patient on public.care_invites (patient_id, status);
create index if not exists care_invites_claimed on public.care_invites (doctor_user_id) where status = 'claimed';

alter table public.care_invites enable row level security;
alter table public.care_invites force row level security;
revoke all on public.care_invites from anon, authenticated;
grant all on public.care_invites to service_role;
