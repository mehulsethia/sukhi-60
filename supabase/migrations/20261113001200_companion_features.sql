-- Companion features: web push, medicine stock, pause-until, mood check-ins, family alerts.
-- All additive and backward compatible: nullable columns or defaults, new tables with RLS.

-- ---------------------------------------------------------------------------
-- 1. Web push subscriptions (one row per device/browser)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 10 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  failures integer not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 2. Medicine stock (counts only; never changes schedule or dose)
-- ---------------------------------------------------------------------------
alter table public.plan_items
  add column stock_count integer check (stock_count between 0 and 10000),
  add column units_per_dose smallint not null default 1 check (units_per_dose between 1 and 20),
  add column stock_updated_at timestamptz;
-- Not part of guard_plan_item's content check, so updating stock never forces re-confirmation.
grant update (stock_count, units_per_dose, stock_updated_at) on public.plan_items to authenticated;

-- One "done" per occurrence per local day uses one dose's worth of stock.
create or replace function public.decrement_stock_on_done() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item uuid;
begin
  if new.kind <> 'done' then return new; end if;
  if exists (select 1 from public.check_ins c
              where c.occurrence_id = new.occurrence_id and c.kind = 'done' and c.local_date = new.local_date and c.id <> new.id) then
    return new;
  end if;
  select item_id into v_item from public.action_occurrences where id = new.occurrence_id;
  update public.plan_items
     set stock_count = greatest(0, stock_count - units_per_dose), stock_updated_at = now()
   where id = v_item and stock_count is not null;
  return new;
end $$;
revoke all on function public.decrement_stock_on_done() from public, anon, authenticated;
create trigger check_ins_decrement_stock after insert on public.check_ins
  for each row execute function public.decrement_stock_on_done();

-- ---------------------------------------------------------------------------
-- 3. Pause a plan until a date (travel, festival, fasting...). Resumed by the worker.
-- ---------------------------------------------------------------------------
alter table public.care_plans
  add column paused_until date,
  add column pause_reason text check (pause_reason in ('travel', 'festival', 'fasting', 'unwell', 'other'));
grant update (paused_until, pause_reason) on public.care_plans to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Mood, stress and sleep check-ins (one per local day; no free text)
-- ---------------------------------------------------------------------------
create table public.mood_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  mood smallint not null check (mood between 1 and 5),
  stress smallint check (stress between 1 and 3),
  sleep_quality smallint check (sleep_quality between 1 and 3),
  sleep_hours numeric(3, 1) check (sleep_hours between 0 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
create trigger mood_checkins_touch before update on public.mood_checkins for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Family alerts: a new, separately-consented scope. No plan details or messages.
-- ---------------------------------------------------------------------------
alter table public.family_access drop constraint family_access_scopes_check;
alter table public.family_access add constraint family_access_scopes_check check (scopes <@ array['weekly_summary', 'garden', 'alerts']);

create table public.family_alerts (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references public.family_access (id) on delete cascade,
  patient_id uuid not null references auth.users (id) on delete cascade,
  member_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('inactive', 'low_stock', 'not_well')),
  dedupe_key text not null unique check (char_length(dedupe_key) <= 160),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index family_alerts_member on public.family_alerts (member_user_id, created_at desc);
create index family_alerts_patient on public.family_alerts (patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'mood_checkins', 'family_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));

create policy mood_checkins_select_own on public.mood_checkins for select to authenticated using (user_id = (select auth.uid()));
grant insert (user_id, local_date, mood, stress, sleep_quality, sleep_hours) on public.mood_checkins to authenticated;
grant update (mood, stress, sleep_quality, sleep_hours) on public.mood_checkins to authenticated;
create policy mood_checkins_insert_own on public.mood_checkins for insert to authenticated with check (user_id = (select auth.uid()));
create policy mood_checkins_update_own on public.mood_checkins for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The patient sees alerts about them; a member sees alerts sent to them while access is active.
create policy family_alerts_select on public.family_alerts for select to authenticated using (
  patient_id = (select auth.uid())
  or (member_user_id = (select auth.uid())
      and exists (select 1 from public.family_access f where f.id = access_id and f.status = 'active' and 'alerts' = any (f.scopes)))
);
grant update (seen_at) on public.family_alerts to authenticated;
create policy family_alerts_member_seen on public.family_alerts for update to authenticated
  using (member_user_id = (select auth.uid())) with check (member_user_id = (select auth.uid()));
