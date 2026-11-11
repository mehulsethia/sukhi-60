-- Plan intake context, daily activity tracking and the operator metrics function.

-- ---------------------------------------------------------------------------
-- 1. Intake: who is setting up the plan, and whether it follows a doctor's care plan.
--    Self-reported context only. Never treated as a diagnosis or used to advise treatment.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column setup_for text check (setup_for in ('self', 'caregiver')),
  add column care_recipient_relation text check (char_length(care_recipient_relation) <= 40),
  add column care_recipient_name text check (char_length(care_recipient_name) <= 80),
  add column health_context text check (health_context in ('diagnosed', 'wellness', 'prefer_not')),
  add column conditions text[] not null default '{}' check (cardinality(conditions) <= 12),
  add column care_situation text check (care_situation in ('discharge', 'new_plan', 'existing')),
  -- Operator flag: team/test accounts excluded from metrics. Not user-writable.
  add column is_internal boolean not null default false;

grant update (setup_for, care_recipient_relation, care_recipient_name, health_context, conditions, care_situation)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Daily activity: one row per user per local day the app was opened.
--    Written only through touch_activity(); no direct access for users.
-- ---------------------------------------------------------------------------
create table public.app_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  hits integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.app_activity enable row level security;
revoke all on public.app_activity from anon, authenticated;
create index app_activity_day on public.app_activity (day);

create or replace function public.touch_activity() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
begin
  if v_uid is null then return; end if;
  select timezone into v_tz from public.profiles where id = v_uid;
  insert into public.app_activity (user_id, day)
  values (v_uid, (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date)
  on conflict (user_id, day) do update set hits = public.app_activity.hits + 1, last_at = now();
end $$;
revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Operator metrics. Service role only (the /admin page checks the admin allowlist
--    before calling it). Days are bucketed in Asia/Kolkata unless a row has local_date.
-- ---------------------------------------------------------------------------
create or replace function public.admin_metrics(
  p_days int default 14,
  p_include_internal boolean default false,
  p_exclude_emails text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_from date := v_today - greatest(p_days, 1) + 1;
  v_result jsonb;
begin
  with
  scope as (
    select p.id from public.profiles p join auth.users u on u.id = p.id
     where (p_include_internal or not p.is_internal)
       and not (lower(coalesce(u.email, '')) = any (coalesce(p_exclude_emails, '{}')))
  ),
  users as (
    select p.id, u.email, (u.created_at at time zone 'Asia/Kolkata')::date as signup_day, u.created_at,
           p.display_name, p.onboarded_at, p.locale::text as locale, p.setup_for, p.health_context, p.conditions, p.is_internal
      from public.profiles p join auth.users u on u.id = p.id
     where p.id in (select id from scope)
  ),
  activity as (
    select distinct user_id, day from (
      select user_id, day from public.app_activity
      union all select user_id, local_date from public.check_ins
      union all select user_id, (created_at at time zone 'Asia/Kolkata')::date from public.messages where role = 'user'
      union all select user_id, (created_at at time zone 'Asia/Kolkata')::date from public.evidence
    ) a where user_id in (select id from scope)
  ),
  occ as (
    select o.user_id, o.local_date, o.status::text as status, o.target_count, o.completed_count, o.due_at, cp.mode::text as mode,
           (o.window_end_at < now()) as closed
      from public.action_occurrences o join public.care_plans cp on cp.id = o.plan_id
     where o.user_id in (select id from scope) and o.status <> 'paused'
  ),
  occ_scored as (
    select *,
      target_count as units_due,
      case when target_count > 1 then least(completed_count, target_count)
           when status in ('self_reported', 'evidence_supported', 'needs_review') then 1 else 0 end as units_done,
      (status in ('self_reported', 'evidence_supported', 'needs_review', 'skipped', 'unable', 'missed') or completed_count > 0) as responded
    from occ
    -- Count an occurrence once its window has closed, or earlier if it is already done.
    where closed or status in ('self_reported', 'evidence_supported', 'needs_review') or (target_count > 1 and completed_count >= target_count)
  ),
  ci as (
    select c.user_id, c.kind::text as kind, c.channel::text as channel, c.created_at, c.local_date, o.due_at
      from public.check_ins c join public.action_occurrences o on o.id = c.occurrence_id
     where c.user_id in (select id from scope)
  ),
  days as (select generate_series(v_from, v_today, interval '1 day')::date as day),
  confirmed as (select distinct user_id from public.plan_items where status = 'confirmed' and user_id in (select id from scope)),
  planned as (select distinct user_id from public.care_plans where user_id in (select id from scope)),
  checked as (select distinct user_id from ci),
  active_days as (select user_id, count(*) as n, max(day) as last_day from activity group by user_id),
  islands as (select user_id, day, day - (row_number() over (partition by user_id order by day))::int as grp from activity),
  runs as (select user_id, grp, count(*) as n, max(day) as last_day from islands group by user_id, grp),
  -- current run of consecutive active days that is still alive (ends today or yesterday)
  streaks as (select user_id, max(n) as streak from runs where last_day >= v_today - 1 group by user_id),
  adh_user as (
    select user_id, sum(units_due) as due, sum(units_done) as done from occ_scored group by user_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'range', jsonb_build_object('from', v_from, 'to', v_today, 'days', p_days),
    'overview', (
      select jsonb_build_object(
        'users', (select count(*) from users),
        'onboarded', (select count(*) from users where onboarded_at is not null),
        'activated', (select count(*) from confirmed),
        'dau_today', (select count(distinct user_id) from activity where day = v_today),
        'wau', (select count(distinct user_id) from activity where day > v_today - 7),
        'avg_dau_7d', (select round(count(*)::numeric / 7, 1) from activity where day > v_today - 7),
        'checkins_total', (select count(*) from ci),
        'checkins_7d', (select count(*) from ci where local_date > v_today - 7),
        'adherence_all', (select round(100.0 * sum(units_done) / nullif(sum(units_due), 0), 1) from occ_scored),
        'adherence_7d', (select round(100.0 * sum(units_done) / nullif(sum(units_due), 0), 1) from occ_scored where local_date > v_today - 7),
        'response_rate_7d', (select round(100.0 * count(*) filter (where responded) / nullif(count(*), 0), 1) from occ_scored where local_date > v_today - 7),
        'silence_rate_7d', (select round(100.0 * count(*) filter (where status = 'no_response') / nullif(count(*), 0), 1) from occ_scored where local_date > v_today - 7),
        'median_min_to_done', (select round((percentile_cont(0.5) within group (order by extract(epoch from (created_at - due_at)) / 60))::numeric, 0)
                                 from ci where kind = 'done' and created_at >= due_at - interval '3 hours'),
        'actions_completed', (select coalesce(sum(units_done), 0) from occ_scored),
        'avg_active_days', (select round(avg(n), 1) from active_days)
      )
    ),
    'funnel', jsonb_build_array(
      jsonb_build_object('step', 'Signed up', 'n', (select count(*) from users)),
      jsonb_build_object('step', 'Finished onboarding', 'n', (select count(*) from users where onboarded_at is not null)),
      jsonb_build_object('step', 'Created a plan', 'n', (select count(*) from planned)),
      jsonb_build_object('step', 'Confirmed an action', 'n', (select count(*) from confirmed)),
      jsonb_build_object('step', 'First check-in', 'n', (select count(*) from checked)),
      jsonb_build_object('step', 'Active on 2+ days', 'n', (select count(*) from active_days where n >= 2)),
      jsonb_build_object('step', 'Active on 5+ days', 'n', (select count(*) from active_days where n >= 5))
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'dau', (select count(distinct user_id) from activity a where a.day = d.day),
        'new_users', (select count(*) from users u where u.signup_day = d.day),
        'checkins', (select count(*) from ci where ci.local_date = d.day),
        'due', (select coalesce(sum(units_due), 0) from occ_scored o where o.local_date = d.day),
        'done', (select coalesce(sum(units_done), 0) from occ_scored o where o.local_date = d.day),
        'adherence', (select round(100.0 * sum(units_done) / nullif(sum(units_due), 0), 1) from occ_scored o where o.local_date = d.day),
        'response_rate', (select round(100.0 * count(*) filter (where responded) / nullif(count(*), 0), 1) from occ_scored o where o.local_date = d.day)
      ) order by d.day), '[]'::jsonb) from days d
    ),
    'retention', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cohort', c.signup_day, 'size', c.size,
        'd1', case when c.signup_day + 1 <= v_today then (select count(distinct a.user_id) from activity a join users u on u.id = a.user_id where u.signup_day = c.signup_day and a.day = c.signup_day + 1) end,
        'd3', case when c.signup_day + 3 <= v_today then (select count(distinct a.user_id) from activity a join users u on u.id = a.user_id where u.signup_day = c.signup_day and a.day = c.signup_day + 3) end,
        'd7', case when c.signup_day + 7 <= v_today then (select count(distinct a.user_id) from activity a join users u on u.id = a.user_id where u.signup_day = c.signup_day and a.day = c.signup_day + 7) end
      ) order by c.signup_day), '[]'::jsonb)
      from (select signup_day, count(*) as size from users where signup_day >= v_from group by signup_day) c
    ),
    'segments', jsonb_build_object(
      'plan_mode', (select coalesce(jsonb_agg(jsonb_build_object('key', mode, 'due', due, 'done', done, 'rate', round(100.0 * done / nullif(due, 0), 1))), '[]'::jsonb)
                      from (select mode, sum(units_due) due, sum(units_done) done from occ_scored group by mode) s),
      'setup_for', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'users', n_users, 'due', due, 'done', done, 'rate', round(100.0 * done / nullif(due, 0), 1))), '[]'::jsonb)
                      from (select coalesce(u.setup_for, 'unknown') k, count(distinct u.id) n_users, coalesce(sum(a.due), 0) due, coalesce(sum(a.done), 0) done
                              from users u left join adh_user a on a.user_id = u.id group by 1) s),
      'health_context', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'users', n_users, 'due', due, 'done', done, 'rate', round(100.0 * done / nullif(due, 0), 1))), '[]'::jsonb)
                      from (select coalesce(u.health_context, 'unknown') k, count(distinct u.id) n_users, coalesce(sum(a.due), 0) due, coalesce(sum(a.done), 0) done
                              from users u left join adh_user a on a.user_id = u.id group by 1) s),
      'locale', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'users', n_users, 'due', due, 'done', done, 'rate', round(100.0 * done / nullif(due, 0), 1))), '[]'::jsonb)
                      from (select u.locale k, count(distinct u.id) n_users, coalesce(sum(a.due), 0) due, coalesce(sum(a.done), 0) done
                              from users u left join adh_user a on a.user_id = u.id group by 1) s),
      'conditions', (select coalesce(jsonb_agg(jsonb_build_object('key', c, 'users', n) order by n desc), '[]'::jsonb)
                      from (select unnest(conditions) c, count(*) n from users group by 1) s),
      'checkin_channel', (select coalesce(jsonb_agg(jsonb_build_object('key', channel, 'n', n)), '[]'::jsonb) from (select channel, count(*) n from ci group by 1) s),
      'checkin_kind', (select coalesce(jsonb_agg(jsonb_build_object('key', kind, 'n', n)), '[]'::jsonb) from (select kind, count(*) n from ci group by 1) s),
      'checkin_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'n', n) order by h), '[]'::jsonb)
                      from (select extract(hour from created_at at time zone 'Asia/Kolkata')::int h, count(*) n from ci group by 1) s)
    ),
    'ai', jsonb_build_object(
      'documents', (select count(*) from public.documents where bucket = 'plan-sources' and user_id in (select id from scope)),
      'extract_done', (select count(*) from public.documents where bucket = 'plan-sources' and extraction_status = 'done' and user_id in (select id from scope)),
      'extract_failed', (select count(*) from public.documents where bucket = 'plan-sources' and extraction_status = 'failed' and user_id in (select id from scope)),
      'extract_avg_ms', (select round(avg((extraction ->> 'latency_ms')::numeric)) from public.documents where extraction ? 'latency_ms' and extraction_status = 'done' and user_id in (select id from scope)),
      'items_extracted', (select count(*) from public.plan_items where provenance = 'extracted' and user_id in (select id from scope)),
      'items_extracted_confirmed', (select count(*) from public.plan_items where provenance = 'extracted' and status in ('confirmed', 'paused') and user_id in (select id from scope)),
      'items_extracted_edited', (select count(distinct v.item_id) from public.plan_item_versions v join public.plan_items i on i.id = v.item_id
                                  where i.provenance = 'extracted' and v.change_kind = 'edited' and i.user_id in (select id from scope)),
      'items_manual', (select count(*) from public.plan_items where provenance = 'manual' and user_id in (select id from scope)),
      'items_template', (select count(*) from public.plan_items where provenance = 'template' and user_id in (select id from scope)),
      'assistant_runs', (select count(*) from public.agent_runs where user_id in (select id from scope)),
      'assistant_users', (select count(distinct user_id) from public.agent_runs where user_id in (select id from scope)),
      'assistant_p50_ms', (select percentile_cont(0.5) within group (order by latency_ms) from public.agent_runs where user_id in (select id from scope) and route = 'model'),
      'assistant_p95_ms', (select percentile_cont(0.95) within group (order by latency_ms) from public.agent_runs where user_id in (select id from scope) and route = 'model'),
      'assistant_error_rate', (select round(100.0 * count(*) filter (where outcome <> 'ok') / nullif(count(*), 0), 1) from public.agent_runs where user_id in (select id from scope)),
      'assistant_routes', (select coalesce(jsonb_agg(jsonb_build_object('key', route, 'n', n)), '[]'::jsonb) from (select route, count(*) n from public.agent_runs where user_id in (select id from scope) group by 1) s),
      'user_messages', (select count(*) from public.messages where role = 'user' and user_id in (select id from scope)),
      'evidence', (select coalesce(jsonb_agg(jsonb_build_object('key', kind, 'n', n)), '[]'::jsonb) from (select kind::text, count(*) n from public.evidence where user_id in (select id from scope) group by 1) s),
      'evaluation_outcomes', (select coalesce(jsonb_agg(jsonb_build_object('key', outcome, 'n', n)), '[]'::jsonb) from (select outcome::text, count(*) n from public.evaluations where method = 'model' and user_id in (select id from scope) group by 1) s)
    ),
    'reminders', jsonb_build_object(
      'whatsapp_linked', (select count(distinct user_id) from public.channel_bindings where status = 'active' and user_id in (select id from scope)),
      'outbound', (select coalesce(jsonb_agg(jsonb_build_object('key', status, 'n', n)), '[]'::jsonb) from (select status::text, count(*) n from public.outbound_messages where user_id in (select id from scope) group by 1) s),
      'reminder_jobs_done', (select count(*) from public.jobs where kind = 'reminder' and status = 'done' and user_id in (select id from scope)),
      'done_within_window', (select round(100.0 * count(*) filter (where status in ('self_reported', 'evidence_supported', 'needs_review')) / nullif(count(*) filter (where closed), 0), 1)
                               from occ where target_count = 1 and closed),
      'returns_after_gap', (select count(*) from public.reward_events where kind = 'return' and user_id in (select id from scope))
    ),
    'safety', jsonb_build_object(
      'escalations', (select count(*) from public.messages where safety_flag = 'escalation' and user_id in (select id from scope)),
      'injection_blocked', (select count(*) from public.messages where safety_flag = 'injection_suspected' and user_id in (select id from scope)),
      'review_requests', (select count(*) from public.review_requests where user_id in (select id from scope)),
      'blocked_runs', (select count(*) from public.agent_runs where route = 'blocked' and user_id in (select id from scope))
    ),
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.display_name, 'email', u.email, 'joined', u.created_at, 'onboarded', u.onboarded_at is not null,
        'locale', u.locale, 'setup_for', u.setup_for, 'health_context', u.health_context, 'internal', u.is_internal,
        'active_days', coalesce(ad.n, 0), 'last_active', ad.last_day, 'streak', coalesce(st.streak, 0),
        'items', (select count(*) from public.plan_items i where i.user_id = u.id and i.status = 'confirmed'),
        'checkins', (select count(*) from ci where ci.user_id = u.id),
        'adherence', (select round(100.0 * done / nullif(due, 0), 1) from adh_user a where a.user_id = u.id),
        'whatsapp', exists (select 1 from public.channel_bindings b where b.user_id = u.id and b.status = 'active')
      ) order by ad.last_day desc nulls last, u.created_at desc), '[]'::jsonb)
      from users u left join active_days ad on ad.user_id = u.id left join streaks st on st.user_id = u.id
    ),
    'feed', (
      select coalesce(jsonb_agg(f order by (f ->> 'at') desc), '[]'::jsonb) from (
        select jsonb_build_object('at', c.created_at, 'who', coalesce(nullif(split_part(p.display_name, ' ', 1), ''), 'User'), 'kind', c.kind::text, 'channel', c.channel::text, 'category', i.category::text) f
          from public.check_ins c
          join public.profiles p on p.id = c.user_id
          join public.action_occurrences o on o.id = c.occurrence_id
          join public.plan_items i on i.id = o.item_id
         where c.user_id in (select id from scope)
         order by c.created_at desc limit 30
      ) x
    )
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.admin_metrics(int, boolean, text[]) from public, anon, authenticated;
grant execute on function public.admin_metrics(int, boolean, text[]) to service_role;

-- Operator toggle for the internal flag (service role only).
create or replace function public.admin_set_internal(p_user uuid, p_internal boolean) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set is_internal = p_internal where id = p_user;
$$;
revoke all on function public.admin_set_internal(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_internal(uuid, boolean) to service_role;
