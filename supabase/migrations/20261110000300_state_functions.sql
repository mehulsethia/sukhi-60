-- Deterministic state transitions. These own completion state and rewards so that no
-- model output, client, or replayed webhook can invent completion or farm rewards.
--
-- Exposure:
--   *_internal and worker functions  -> service_role only (server/worker, after explicit authorization)
--   record_check_in / accept_family_invite / family_summary -> authenticated, scoped to auth.uid()

-- ---------------------------------------------------------------------------
-- Reward rules (single source of truth; mirrored as documentation in src/domain/rewards.ts)
--   participation   1 pt  once per occurrence, for an honest response (done/skipped/unable/missed)
--   completion      2 pts once per occurrence (weekly targets: once per distinct local day, up to target)
--   evidence_bonus  1 pt  once per occurrence when evidence is assessed as supporting
--   return          3 pts once per local day, first completion after a recent non-completed day
--   milestone       first completion ever (2), 3 completion-days in a week (2), 5 days (3)
--   daily cap       participation+completion+evidence_bonus <= 12 pts per local day
--   Nothing is ever subtracted. Extra doses / exceeding targets earn nothing.
-- ---------------------------------------------------------------------------
create or replace function public._award(
  p_user uuid, p_kind public.reward_kind, p_occurrence uuid, p_points int, p_local_date date,
  p_label text, p_dedupe text, p_capped boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  awarded int := p_points;
  today int;
  inserted_id uuid;
begin
  if p_capped then
    select coalesce(sum(points), 0) into today from public.reward_events
     where user_id = p_user and local_date = p_local_date
       and kind in ('participation', 'completion', 'evidence_bonus');
    awarded := greatest(0, least(p_points, 12 - today));
  end if;
  insert into public.reward_events (user_id, kind, occurrence_id, points, local_date, week_start, label, dedupe_key)
  values (p_user, p_kind, p_occurrence, awarded, p_local_date, date_trunc('week', p_local_date)::date, p_label, p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into inserted_id;
  if inserted_id is null then
    return null;
  end if;
  return jsonb_build_object('kind', p_kind, 'points', awarded, 'label', p_label);
end $$;

create or replace function public._completion_followups(p_user uuid, p_occurrence uuid, p_local_date date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  out jsonb := '[]'::jsonb;
  r jsonb;
  days int;
  wk date := date_trunc('week', p_local_date)::date;
begin
  -- return after a recent non-completed day (rewards restarting, never punishes the gap)
  if exists (
       select 1 from public.action_occurrences o
        where o.user_id = p_user and o.local_date between p_local_date - 3 and p_local_date - 1
          and o.status in ('no_response', 'missed', 'skipped', 'unable'))
     and not exists (
       select 1 from public.reward_events e
        where e.user_id = p_user and e.kind = 'completion' and e.local_date = p_local_date - 1) then
    r := public._award(p_user, 'return', p_occurrence, 3, p_local_date, 'Welcome back',
                       'return:' || p_user || ':' || p_local_date, false);
    if r is not null then out := out || r; end if;
  end if;

  r := public._award(p_user, 'milestone', p_occurrence, 2, p_local_date, 'First step',
                     'milestone:first:' || p_user, false);
  if r is not null then out := out || r; end if;

  select count(distinct local_date) into days from public.reward_events
   where user_id = p_user and kind = 'completion' and week_start = wk;
  if days >= 3 then
    r := public._award(p_user, 'milestone', p_occurrence, 2, p_local_date, 'Three good days this week',
                       'milestone:week3:' || p_user || ':' || wk, false);
    if r is not null then out := out || r; end if;
  end if;
  if days >= 5 then
    r := public._award(p_user, 'milestone', p_occurrence, 3, p_local_date, 'Five good days this week',
                       'milestone:week5:' || p_user || ':' || wk, false);
    if r is not null then out := out || r; end if;
  end if;
  return out;
end $$;

-- ---------------------------------------------------------------------------
-- Check-in: idempotent, atomic status transition + reward issuance
-- ---------------------------------------------------------------------------
create or replace function public.apply_check_in_internal(
  p_user uuid, p_occurrence uuid, p_kind public.check_in_kind, p_channel public.channel_kind,
  p_idempotency_key text, p_reason text default null, p_note text default null, p_snooze_minutes int default 60
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  occ public.action_occurrences;
  ci_id uuid;
  ldate date;
  new_status public.occurrence_status;
  rewards jsonb := '[]'::jsonb;
  r jsonb;
  is_weekly boolean;
  already_today boolean;
  completed boolean := false;
  result_code text := 'recorded';
begin
  if p_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into occ from public.action_occurrences where id = p_occurrence for update;
  if not found or occ.user_id <> p_user then
    -- identical error for "missing" and "not yours" to avoid leaking existence
    raise exception 'occurrence_not_found' using errcode = 'P0002';
  end if;
  if occ.status = 'paused' then
    raise exception 'occurrence_paused' using errcode = '22023';
  end if;
  is_weekly := occ.target_count > 1 or exists (
    select 1 from public.plan_items i where i.id = occ.item_id and i.schedule_kind = 'weekly_target');
  if not is_weekly and occ.due_at > now() + interval '2 hours' and p_kind <> 'note' then
    raise exception 'occurrence_not_yet_due' using errcode = '22023';
  end if;

  ldate := (now() at time zone occ.timezone)::date;

  insert into public.check_ins (user_id, occurrence_id, kind, reason, note, channel, idempotency_key, local_date)
  values (p_user, p_occurrence, p_kind, left(p_reason, 300), left(p_note, 1000), p_channel, p_idempotency_key, ldate)
  on conflict (user_id, idempotency_key) do nothing
  returning id into ci_id;

  if ci_id is null then
    return jsonb_build_object('duplicate', true, 'status', occ.status, 'rewards', '[]'::jsonb, 'result', 'duplicate');
  end if;

  new_status := occ.status;

  if p_kind = 'done' then
    if is_weekly then
      select exists (
        select 1 from public.check_ins c
         where c.occurrence_id = occ.id and c.kind = 'done' and c.local_date = ldate and c.id <> ci_id
      ) into already_today;
      if already_today or occ.completed_count >= occ.target_count then
        result_code := 'already_counted';
      else
        update public.action_occurrences set completed_count = completed_count + 1 where id = occ.id;
        completed := true;
        if occ.completed_count + 1 >= occ.target_count then
          new_status := 'self_reported';
        elsif occ.status in ('pending', 'later', 'awaiting_response', 'no_response') then
          new_status := 'due';
        end if;
      end if;
    else
      if occ.status in ('self_reported', 'evidence_supported') then
        -- No extra credit for an extra dose or repeat; nothing changes.
        result_code := 'already_recorded';
      else
        new_status := 'self_reported';
        completed := true;
      end if;
    end if;
  elsif p_kind = 'later' then
    if occ.status not in ('self_reported', 'evidence_supported') then
      new_status := 'later';
      update public.action_occurrences
         set snooze_until = least(now() + make_interval(mins => greatest(10, least(p_snooze_minutes, 240))),
                                  window_end_at - interval '5 minutes')
       where id = occ.id;
    else
      result_code := 'already_recorded';
    end if;
  elsif p_kind in ('skipped', 'unable', 'missed') then
    if is_weekly and occ.completed_count > 0 then
      result_code := 'noted';  -- a skipped day does not undo earlier days of a weekly target
    else
      new_status := p_kind::text::public.occurrence_status;
    end if;
  end if;

  if new_status is distinct from occ.status then
    update public.action_occurrences set status = new_status, status_changed_at = now() where id = occ.id;
  end if;

  if p_kind in ('done', 'skipped', 'unable', 'missed') then
    r := public._award(p_user, 'participation', occ.id, 1, ldate, 'Honest check-in',
                       'participation:' || occ.id || case when is_weekly then ':' || ldate else '' end, true);
    if r is not null then rewards := rewards || r; end if;
  end if;

  if completed then
    r := public._award(p_user, 'completion', occ.id, 2, ldate, 'Action done',
                       'completion:' || occ.id || case when is_weekly then ':' || ldate else '' end, true);
    if r is not null then rewards := rewards || r; end if;
    rewards := rewards || public._completion_followups(p_user, occ.id, ldate);
  end if;

  insert into public.audit_events (user_id, actor, action, entity, entity_id, details)
  values (p_user, 'user', 'check_in_' || p_kind, 'action_occurrence', occ.id::text,
          jsonb_build_object('channel', p_channel, 'from', occ.status, 'to', new_status, 'result', result_code));

  return jsonb_build_object('duplicate', false, 'check_in_id', ci_id, 'status', new_status,
                            'rewards', rewards, 'result', result_code, 'local_date', ldate);
end $$;

-- Client-facing wrapper: identity comes only from the session, never from an argument.
create or replace function public.record_check_in(
  p_occurrence uuid, p_kind public.check_in_kind, p_idempotency_key text,
  p_reason text default null, p_note text default null, p_snooze_minutes int default 60
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.apply_check_in_internal((select auth.uid()), p_occurrence, p_kind, 'web',
                                        p_idempotency_key, p_reason, p_note, p_snooze_minutes);
end $$;

-- ---------------------------------------------------------------------------
-- Evaluation application (service only; evaluations are written by the server)
-- ---------------------------------------------------------------------------
create or replace function public.apply_evaluation_internal(p_evaluation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.evaluations;
  occ public.action_occurrences;
  new_status public.occurrence_status;
  rewards jsonb := '[]'::jsonb;
  r jsonb;
  ldate date;
begin
  select * into ev from public.evaluations where id = p_evaluation;
  if not found then raise exception 'evaluation_not_found' using errcode = 'P0002'; end if;
  select * into occ from public.action_occurrences where id = ev.occurrence_id for update;
  if occ.user_id <> ev.user_id then raise exception 'ownership_mismatch' using errcode = '42501'; end if;
  ldate := (now() at time zone occ.timezone)::date;
  new_status := occ.status;

  if ev.outcome = 'supports' and not ev.needs_review then
    if occ.status not in ('paused') then
      new_status := 'evidence_supported';
      r := public._award(occ.user_id, 'participation', occ.id, 1, ldate, 'Honest check-in', 'participation:' || occ.id, true);
      if r is not null then rewards := rewards || r; end if;
      r := public._award(occ.user_id, 'completion', occ.id, 2, ldate, 'Action done', 'completion:' || occ.id, true);
      if r is not null then
        rewards := rewards || r;
        rewards := rewards || public._completion_followups(occ.user_id, occ.id, ldate);
      end if;
      r := public._award(occ.user_id, 'evidence_bonus', occ.id, 1, ldate, 'Shared a photo or note', 'evidence:' || occ.id, true);
      if r is not null then rewards := rewards || r; end if;
    end if;
  elsif ev.outcome = 'partially_supports' and not ev.needs_review then
    if occ.status not in ('self_reported', 'evidence_supported', 'paused') then
      new_status := 'needs_review';
    end if;
  elsif ev.outcome = 'not_applicable' or (ev.outcome = 'unclear' and not ev.needs_review) then
    null;  -- saved, described where possible, no status change (e.g. evaluator unconfigured)
  else
    if occ.status not in ('evidence_supported', 'paused') then
      new_status := 'needs_review';
    end if;
    insert into public.review_requests (user_id, occurrence_id, evaluation_id, item_id, reason, source)
    values (occ.user_id, occ.id, ev.id, occ.item_id, 'Evidence could not be assessed clearly', 'evaluator');
  end if;

  if new_status is distinct from occ.status then
    update public.action_occurrences set status = new_status, status_changed_at = now() where id = occ.id;
  end if;
  return jsonb_build_object('status', new_status, 'rewards', rewards);
end $$;

-- ---------------------------------------------------------------------------
-- Silence rule: an open occurrence whose window has fully elapsed becomes
-- 'no_response' (unknown), never 'missed'.
-- ---------------------------------------------------------------------------
create or replace function public.apply_silence_rule(p_limit int default 500) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with c as (
    select id from public.action_occurrences
     where status in ('pending', 'due', 'awaiting_response', 'later') and window_end_at < now()
     order by window_end_at limit greatest(1, least(p_limit, 2000))
     for update skip locked
  )
  update public.action_occurrences o set status = 'no_response', status_changed_at = now()
    from c where o.id = c.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Durable job queue: leases, expiry recovery, bounded batches, backoff, dead letter
-- ---------------------------------------------------------------------------
create or replace function public.claim_jobs(p_worker text, p_limit int default 10, p_lease_seconds int default 120)
returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  -- recover expired leases
  update public.jobs
     set status = case when attempts >= max_attempts then 'dead'::public.job_status else 'queued'::public.job_status end,
         locked_until = null, locked_by = null,
         last_error = coalesce(last_error, 'lease_expired'), run_at = now()
   where status = 'running' and locked_until < now();

  return query
  with c as (
    select id from public.jobs
     where status = 'queued' and run_at <= now()
     order by run_at
     limit greatest(1, least(p_limit, 50))
     for update skip locked
  )
  update public.jobs j
     set status = 'running', attempts = j.attempts + 1,
         locked_until = now() + make_interval(secs => greatest(15, least(p_lease_seconds, 600))),
         locked_by = p_worker
    from c where j.id = c.id
  returning j.*;
end $$;

-- Claim one specific queued job (used to process a just-received webhook promptly;
-- if this never runs, the scheduled worker claims it later).
create or replace function public.claim_job(p_job uuid, p_worker text, p_lease_seconds int default 120)
returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.jobs
     set status = 'running', attempts = attempts + 1,
         locked_until = now() + make_interval(secs => greatest(15, least(p_lease_seconds, 600))),
         locked_by = p_worker
   where id = p_job and status = 'queued' and run_at <= now()
  returning *;
end $$;
revoke all on function public.claim_job(uuid, text, int) from public, anon, authenticated;
grant execute on function public.claim_job(uuid, text, int) to service_role;

create or replace function public.complete_job(p_job uuid, p_worker text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.jobs set status = 'done', locked_until = null
   where id = p_job and locked_by = p_worker and status = 'running';
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function public.fail_job(p_job uuid, p_worker text, p_error text, p_permanent boolean default false)
returns public.job_status
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; s public.job_status;
begin
  select * into j from public.jobs where id = p_job and locked_by = p_worker and status = 'running' for update;
  if not found then return null; end if;
  if p_permanent or j.attempts >= j.max_attempts then s := 'dead'; else s := 'queued'; end if;
  update public.jobs
     set status = s, locked_until = null, locked_by = null, last_error = left(p_error, 500),
         run_at = case when s = 'queued' then now() + make_interval(secs => least(3600, 30 * power(2, j.attempts)::int)) else run_at end
   where id = p_job;
  return s;
end $$;

create or replace function public.cancel_job(p_job uuid, p_worker text, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.jobs set status = 'cancelled', locked_until = null, last_error = left(p_reason, 500)
   where id = p_job and locked_by = p_worker and status = 'running';
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ---------------------------------------------------------------------------
-- WhatsApp linking: one-time code proven by a message from the WhatsApp account
-- ---------------------------------------------------------------------------
create or replace function public.consume_link_code(p_code_hash text, p_external_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  lc public.link_codes;
  ext_hash text := encode(extensions.digest(p_external_id, 'sha256'), 'hex');
  existing public.channel_bindings;
  mine public.channel_bindings;
  failures int;
  new_id uuid;
begin
  select count(*) into failures from public.audit_events
   where action = 'whatsapp_link_failed' and entity_id = ext_hash and created_at > now() - interval '1 hour';
  if failures >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select * into lc from public.link_codes where code_hash = p_code_hash for update;
  if not found or lc.used_at is not null or lc.expires_at < now() then
    insert into public.audit_events (user_id, actor, action, entity, entity_id, details)
    values (null, 'system', 'whatsapp_link_failed', 'link_code', ext_hash,
            jsonb_build_object('reason', case when not found then 'unknown' when lc.used_at is not null then 'replayed' else 'expired' end));
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  end if;

  update public.link_codes set used_at = now(), used_by_external_hash = ext_hash where id = lc.id;

  select * into existing from public.channel_bindings
   where channel = 'whatsapp' and external_id = p_external_id and status <> 'revoked';
  if found and existing.user_id <> lc.user_id then
    insert into public.audit_events (user_id, actor, action, entity, entity_id, details)
    values (lc.user_id, 'system', 'whatsapp_link_failed', 'link_code', ext_hash, '{"reason":"number_bound_elsewhere"}');
    return jsonb_build_object('ok', false, 'reason', 'number_bound_to_other_account');
  elsif found then
    update public.channel_bindings set status = 'active', last_inbound_at = now(), opted_out_at = null where id = existing.id;
    return jsonb_build_object('ok', true, 'reason', 'already_linked', 'user_id', lc.user_id, 'binding_id', existing.id);
  end if;

  select * into mine from public.channel_bindings
   where user_id = lc.user_id and channel = 'whatsapp' and status <> 'revoked';
  if found then
    if lc.purpose <> 'rebind' then
      return jsonb_build_object('ok', false, 'reason', 'rebind_confirmation_required');
    end if;
    update public.channel_bindings set status = 'revoked', opted_out_at = now() where id = mine.id;
  end if;

  insert into public.channel_bindings (user_id, channel, external_id, status, last_inbound_at)
  values (lc.user_id, 'whatsapp', p_external_id, 'active', now())
  returning id into new_id;

  insert into public.audit_events (user_id, actor, action, entity, entity_id, details)
  values (lc.user_id, 'system', 'whatsapp_linked', 'channel_binding', new_id::text, jsonb_build_object('purpose', lc.purpose));
  return jsonb_build_object('ok', true, 'reason', 'linked', 'user_id', lc.user_id, 'binding_id', new_id);
end $$;

-- ---------------------------------------------------------------------------
-- Family support: accept invite + aggregated, scope-limited summary.
-- Revocation is effective immediately because status is evaluated on every call.
-- ---------------------------------------------------------------------------
create or replace function public.accept_family_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fa public.family_access; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into fa from public.family_access
   where invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or fa.status <> 'invited' or fa.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  end if;
  if fa.patient_id = me then
    return jsonb_build_object('ok', false, 'reason', 'cannot_accept_own_invite');
  end if;
  update public.family_access set status = 'active', member_user_id = me, accepted_at = now() where id = fa.id;
  insert into public.audit_events (user_id, actor, action, entity, entity_id)
  values (fa.patient_id, 'family_member', 'family_invite_accepted', 'family_access', fa.id::text);
  return jsonb_build_object('ok', true, 'access_id', fa.id);
end $$;

create or replace function public.family_summary(p_access uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  fa public.family_access;
  tz text;
  wk date;
  days jsonb;
  pts int;
  name text;
begin
  select * into fa from public.family_access
   where id = p_access and member_user_id = (select auth.uid()) and status = 'active';
  if not found then
    raise exception 'access_not_active' using errcode = '42501';
  end if;
  select p.timezone, split_part(coalesce(p.display_name, ''), ' ', 1) into tz, name
    from public.profiles p where p.id = fa.patient_id;
  wk := date_trunc('week', (now() at time zone coalesce(tz, 'UTC'))::date)::date;

  select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'responded', coalesce(x.responded, 0), 'completed', coalesce(x.completed, 0)) order by d), '[]'::jsonb)
    into days
    from generate_series(wk, wk + 6, interval '1 day') d
    left join (
      select o.local_date,
             count(*) filter (where o.status in ('self_reported', 'evidence_supported', 'skipped', 'unable', 'missed')) as responded,
             count(*) filter (where o.status in ('self_reported', 'evidence_supported')) as completed
        from public.action_occurrences o
       where o.user_id = fa.patient_id and o.local_date between wk and wk + 6
       group by o.local_date
    ) x on x.local_date = d::date;

  if 'garden' = any (fa.scopes) then
    select coalesce(sum(points), 0) into pts from public.reward_events where user_id = fa.patient_id;
  end if;

  return jsonb_build_object('first_name', nullif(name, ''), 'week_start', wk, 'days', days,
                            'garden_points', pts, 'scopes', fa.scopes);
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public._award(uuid, public.reward_kind, uuid, int, date, text, text, boolean) from public, anon, authenticated;
revoke all on function public._completion_followups(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.apply_check_in_internal(uuid, uuid, public.check_in_kind, public.channel_kind, text, text, text, int) from public, anon, authenticated;
revoke all on function public.apply_evaluation_internal(uuid) from public, anon, authenticated;
revoke all on function public.apply_silence_rule(int) from public, anon, authenticated;
revoke all on function public.claim_jobs(text, int, int) from public, anon, authenticated;
revoke all on function public.complete_job(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cancel_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.consume_link_code(text, text) from public, anon, authenticated;
revoke all on function public.record_check_in(uuid, public.check_in_kind, text, text, text, int) from public, anon;
revoke all on function public.accept_family_invite(text) from public, anon;
revoke all on function public.family_summary(uuid) from public, anon;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.guard_care_plan() from public, anon, authenticated;
revoke all on function public.guard_plan_item() from public, anon, authenticated;
revoke all on function public.guard_family_access() from public, anon, authenticated;

grant execute on function public.apply_check_in_internal(uuid, uuid, public.check_in_kind, public.channel_kind, text, text, text, int) to service_role;
grant execute on function public.apply_evaluation_internal(uuid) to service_role;
grant execute on function public.apply_silence_rule(int) to service_role;
grant execute on function public.claim_jobs(text, int, int) to service_role;
grant execute on function public.complete_job(uuid, text) to service_role;
grant execute on function public.fail_job(uuid, text, text, boolean) to service_role;
grant execute on function public.cancel_job(uuid, text, text) to service_role;
grant execute on function public.consume_link_code(text, text) to service_role;
grant execute on function public.record_check_in(uuid, public.check_in_kind, text, text, text, int) to authenticated, service_role;
grant execute on function public.accept_family_invite(text) to authenticated;
grant execute on function public.family_summary(uuid) to authenticated;

-- Job health (service only), used by scripts/job-health and the operator view.
create or replace view public.job_health with (security_invoker = true) as
select kind, status, count(*) as jobs, min(run_at) as oldest_run_at, max(updated_at) as last_update,
       count(*) filter (where status = 'running' and locked_until < now()) as expired_leases
  from public.jobs group by kind, status;
revoke all on public.job_health from anon, authenticated;
grant select on public.job_health to service_role;
