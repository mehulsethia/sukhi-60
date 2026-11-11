-- Adaptive Behaviour & Creative Intelligence Engine (ABCIE), pilot MVP.
-- Backward compatible: every new profile column is nullable or has a default, so existing
-- accounts keep working and are never sent back through onboarding.
--
-- HabitEvent mapping (no parallel event table):
--   scheduled            -> action_occurrences
--   completed/skipped/missed/later/unable -> check_ins (append-only, idempotent)
--   unknown / no reply   -> action_occurrences.status = 'no_response' (never 'missed')
--   rescheduled / alternative_accepted / alternative_declined -> support_suggestions.status
--
-- Retention: rows below are deleted with the account (on delete cascade). A time-based
-- retention period still has to be decided before production (see OPEN_QUESTIONS.md).

-- ---------------------------------------------------------------------------
-- 1. Explicit behavioural preferences (stated by the user; never overwritten by learning)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column communication_styles text[] not null default '{}'
    check (cardinality(communication_styles) <= 2
           and communication_styles <@ array['warm_gentle', 'fun_playful', 'motivating', 'simple_practical']),
  add column restart_preference text
    check (restart_preference in ('encouragement', 'simpler_alternative', 'gentle_push', 'give_space')),
  add column personal_motivation text check (char_length(personal_motivation) <= 280),
  add column behaviour_schema_version smallint not null default 1,
  add column behaviour_prefs_updated_at timestamptz,
  -- Learned signals are computed from events after this instant ("reset what Sukhi learned").
  add column learning_reset_at timestamptz;

grant update (communication_styles, restart_preference, personal_motivation, behaviour_prefs_updated_at, learning_reset_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Habit confidence (optional, 1–10, tied to the initial routine or plan)
-- ---------------------------------------------------------------------------
create table public.habit_confidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.care_plans (id) on delete cascade,
  item_id uuid references public.plan_items (id) on delete cascade,
  confidence smallint check (confidence between 1 and 10),
  recorded_at timestamptz not null default now()
);
create index habit_confidence_user on public.habit_confidence (user_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- 3. Barrier reports (tappable reason codes; no free-text health detail)
-- ---------------------------------------------------------------------------
create table public.barrier_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.plan_items (id) on delete cascade,
  occurrence_id uuid references public.action_occurrences (id) on delete set null,
  check_in_id uuid references public.check_ins (id) on delete set null,
  nudge_event_id uuid,
  barrier_code text not null check (barrier_code in (
    'forgot', 'busy', 'low_motivation', 'routine_disrupted', 'too_difficult', 'physical_discomfort', 'other', 'prefer_not_to_say')),
  channel public.channel_kind not null default 'web',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index barrier_reports_user on public.barrier_reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Nudge events (what was decided and how it was worded; message text is not stored)
-- ---------------------------------------------------------------------------
create table public.nudge_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references public.plan_items (id) on delete set null,
  occurrence_id uuid references public.action_occurrences (id) on delete set null,
  kind text not null check (kind in ('scheduled_checkin', 'gentle_reminder', 'barrier_question', 'restart_offer', 'positive_reinforcement')),
  strategy_id text not null check (char_length(strategy_id) <= 60),
  style_used text not null check (style_used in ('warm_gentle', 'fun_playful', 'motivating', 'simple_practical', 'neutral')),
  template_or_variant_id text not null check (char_length(template_or_variant_id) <= 80),
  wording_source text not null default 'template' check (wording_source in ('template', 'llm')),
  channel public.channel_kind not null default 'web',
  -- true when the user started the interaction (e.g. tapped a reason); false for proactive follow-ups
  user_initiated boolean not null default false,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  outcome text check (outcome in ('completed', 'dismissed', 'no_response', 'unknown')),
  dedupe_key text unique check (char_length(dedupe_key) <= 160)
);
create index nudge_events_user on public.nudge_events (user_id, created_at desc);

alter table public.barrier_reports
  add constraint barrier_reports_nudge_fk foreign key (nudge_event_id) references public.nudge_events (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. Support suggestions: proposed changes that need an explicit yes before anything changes
-- ---------------------------------------------------------------------------
create table public.support_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.plan_items (id) on delete cascade,
  item_version integer not null,
  barrier_report_id uuid references public.barrier_reports (id) on delete set null,
  nudge_event_id uuid references public.nudge_events (id) on delete set null,
  kind text not null check (kind in ('time_change', 'smaller_action')),
  strategy_id text not null check (char_length(strategy_id) <= 60),
  -- e.g. {"from_time": "18:00", "proposed_time": "19:00"}; the user may pick another time on accept
  proposal jsonb not null default '{}'::jsonb,
  status text not null default 'shown' check (status in ('shown', 'accepted', 'declined', 'expired', 'stale')),
  applied jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 days',
  decided_at timestamptz
);
create index support_suggestions_user on public.support_suggestions (user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Row level security: users read their own rows; the server writes after verifying
--    the session (service role). Confidence is the only user-inserted row.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['habit_confidence', 'barrier_reports', 'nudge_events', 'support_suggestions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
  end loop;
end $$;

grant insert (user_id, plan_id, item_id, confidence) on public.habit_confidence to authenticated;
create policy habit_confidence_insert_own on public.habit_confidence for insert to authenticated
  with check (user_id = (select auth.uid())
    and (plan_id is null or exists (select 1 from public.care_plans p where p.id = plan_id and p.user_id = (select auth.uid())))
    and (item_id is null or exists (select 1 from public.plan_items i where i.id = item_id and i.user_id = (select auth.uid()))));
