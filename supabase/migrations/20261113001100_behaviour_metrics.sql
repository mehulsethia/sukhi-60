-- Pilot metrics for the Adaptive Behaviour Engine. Aggregates only: no message text, no
-- personal motivation, no per-user rows. Service role only (the /admin page checks the
-- operator allowlist first). Definitions: src/domain/learning.ts#METRIC_DEFINITIONS.
create or replace function public.admin_behaviour_metrics(
  p_days int default 14,
  p_include_internal boolean default false,
  p_exclude_emails text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_from date := v_today - greatest(p_days, 1) + 1;
  v_from_ts timestamptz := (v_from::timestamp at time zone 'Asia/Kolkata');
  v_result jsonb;
begin
  with
  scope as (
    select p.id from public.profiles p join auth.users u on u.id = p.id
     where (p_include_internal or not p.is_internal)
       and not (lower(coalesce(u.email, '')) = any (coalesce(p_exclude_emails, '{}')))
  ),
  prof as (select * from public.profiles where id in (select id from scope)),
  -- closed single-time opportunities in range; unknown (no_response) kept separate
  occ as (
    select o.user_id, o.item_id, o.local_date, o.status::text as status
      from public.action_occurrences o
     where o.user_id in (select id from scope) and o.target_count = 1 and o.status <> 'paused'
       and o.local_date between v_from and v_today
       and (o.window_end_at < now() or o.status in ('self_reported', 'evidence_supported', 'skipped', 'unable', 'missed'))
  ),
  scored as (
    select *, status in ('self_reported', 'evidence_supported') as done,
              status in ('self_reported', 'evidence_supported', 'skipped', 'unable', 'missed') as known,
              status = 'no_response' as unknown
      from occ
  ),
  lapses as (select distinct user_id, item_id, local_date from scored where status in ('missed', 'skipped', 'unable', 'no_response')),
  recovered as (
    select distinct l.user_id from lapses l
     where exists (select 1 from public.action_occurrences o
                    where o.user_id = l.user_id and o.item_id = l.item_id
                      and o.status in ('self_reported', 'evidence_supported')
                      and o.local_date > l.local_date and o.local_date <= l.local_date + 3)
  ),
  nudges as (select * from public.nudge_events where user_id in (select id from scope) and created_at >= v_from_ts),
  proactive as (select * from nudges where not user_initiated),
  barriers as (select * from public.barrier_reports where user_id in (select id from scope) and created_at >= v_from_ts),
  sugg as (
    select s.*, case when s.status = 'shown' and s.expires_at < now() then 'expired' else s.status end as eff_status
      from public.support_suggestions s where s.user_id in (select id from scope) and s.created_at >= v_from_ts
  ),
  conf as (select * from public.habit_confidence where user_id in (select id from scope))
  select jsonb_build_object(
    'generated_at', now(),
    'range', jsonb_build_object('from', v_from, 'to', v_today, 'days', p_days),
    'onboarding', jsonb_build_object(
      'started', (select count(*) from prof),
      'completed', (select count(*) from prof where onboarded_at is not null)
    ),
    'preferences', jsonb_build_object(
      'answered', (select count(*) from prof where behaviour_prefs_updated_at is not null),
      'motivation_provided', (select count(*) from prof where personal_motivation is not null),
      'styles', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', n) order by n desc), '[]'::jsonb)
                   from (select unnest(communication_styles) k, count(*) n from prof group by 1) s),
      'restart', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', n) order by n desc), '[]'::jsonb)
                   from (select coalesce(restart_preference, 'not_answered') k, count(*) n from prof group by 1) s),
      'confidence_n', (select count(confidence) from conf),
      'confidence_avg', (select round(avg(confidence)::numeric, 1) from conf),
      'confidence', (select coalesce(jsonb_agg(jsonb_build_object('key', confidence, 'n', n) order by confidence), '[]'::jsonb)
                   from (select confidence, count(*) n from conf where confidence is not null group by 1) s)
    ),
    'completion', jsonb_build_object(
      'done', (select count(*) from scored where done),
      'known', (select count(*) from scored where known),
      'unknown', (select count(*) from scored where unknown),
      'rate', (select round(100.0 * count(*) filter (where done) / nullif(count(*) filter (where known), 0), 1) from scored)
    ),
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'done', d, 'known', k, 'unknown', u, 'rate', round(100.0 * d / nullif(k, 0), 1)) order by wk), '[]'::jsonb)
                 from (select date_trunc('week', local_date)::date wk, count(*) filter (where done) d, count(*) filter (where known) k, count(*) filter (where unknown) u from scored group by 1) w),
    'recovery', jsonb_build_object(
      'users_with_lapse', (select count(distinct user_id) from lapses),
      'users_recovered', (select count(*) from recovered),
      'rate', (select round(100.0 * (select count(*) from recovered) / nullif((select count(distinct user_id) from lapses), 0), 1))
    ),
    'barriers', (select coalesce(jsonb_agg(jsonb_build_object('key', barrier_code, 'n', n) order by n desc), '[]'::jsonb)
                   from (select barrier_code, count(*) n from barriers group by 1) s),
    'nudges', jsonb_build_object(
      'proactive_delivered', (select count(*) from proactive where delivered_at is not null),
      'proactive_acknowledged', (select count(*) from proactive where acknowledged_at is not null),
      'proactive_dismissed', (select count(*) from proactive where outcome = 'dismissed'),
      'engagement_rate', (select round(100.0 * count(*) filter (where acknowledged_at is not null) / nullif(count(*) filter (where delivered_at is not null), 0), 1) from proactive),
      'replies_to_user', (select count(*) from nudges where user_initiated),
      'llm_worded', (select count(*) from nudges where wording_source = 'llm'),
      'by_strategy', (select coalesce(jsonb_agg(jsonb_build_object('key', strategy_id, 'n', n) order by n desc), '[]'::jsonb)
                        from (select strategy_id, count(*) n from nudges group by 1) s),
      'by_style', (select coalesce(jsonb_agg(jsonb_build_object('key', style_used, 'sent', sent, 'ack', ack) order by sent desc), '[]'::jsonb)
                        from (select style_used, count(*) sent, count(*) filter (where acknowledged_at is not null) ack from proactive group by 1) s)
    ),
    'suggestions', jsonb_build_object(
      'shown', (select count(*) from sugg),
      'accepted', (select count(*) from sugg where eff_status = 'accepted'),
      'declined', (select count(*) from sugg where eff_status = 'declined'),
      'expired_or_stale', (select count(*) from sugg where eff_status in ('expired', 'stale')),
      'acceptance_rate', (select round(100.0 * count(*) filter (where eff_status = 'accepted') / nullif(count(*), 0), 1) from sugg),
      'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('key', kind, 'shown', n, 'accepted', a)), '[]'::jsonb)
                    from (select kind, count(*) n, count(*) filter (where eff_status = 'accepted') a from sugg group by 1) s)
    )
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.admin_behaviour_metrics(int, boolean, text[]) from public, anon, authenticated;
grant execute on function public.admin_behaviour_metrics(int, boolean, text[]) to service_role;
