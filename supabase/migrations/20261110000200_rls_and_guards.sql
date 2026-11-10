-- Row level security, least-privilege grants, and integrity guards.
-- Principle: authenticated users may READ their own rows. Direct WRITES are limited to
-- user-owned preference/plan data via column grants. State transitions (check-ins,
-- occurrence status, rewards, evaluations, bindings, jobs) happen only through scoped
-- functions or the server's service role after explicit authorization.

-- Start from zero privileges for client roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','consents','documents','care_plans','plan_items','plan_item_versions','change_proposals',
    'action_occurrences','check_ins','evidence','evaluations','review_requests','messages','memory_facts',
    'channel_bindings','link_codes','inbound_events','outbound_messages','jobs','reward_events','reward_goals',
    'family_access','agent_runs','audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- service_role keeps full access (server-side only; never shipped to the browser).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Read access to own rows
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'consents','documents','care_plans','plan_items','plan_item_versions','change_proposals',
    'action_occurrences','check_ins','evidence','evaluations','review_requests','messages','memory_facts',
    'channel_bindings','outbound_messages','reward_events','reward_goals','agent_runs','audit_events'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
  end loop;
end $$;

grant select on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Limited direct writes (column-level grants + ownership policies)
-- ---------------------------------------------------------------------------
grant update (display_name, locale, timezone, checkin_times, quiet_start, quiet_end, reminder_frequency,
              accessibility, limitations, care_notes, onboarded_at) on public.profiles to authenticated;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant insert (user_id, kind, granted, policy_version, granted_at, revoked_at) on public.consents to authenticated;
grant update (granted, policy_version, granted_at, revoked_at) on public.consents to authenticated;
create policy consents_insert_own on public.consents for insert to authenticated with check (user_id = (select auth.uid()));
create policy consents_update_own on public.consents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant insert (user_id, bucket, storage_path, mime_type, size_bytes, sha256, original_name) on public.documents to authenticated;
grant delete on public.documents to authenticated;
create policy documents_insert_own on public.documents for insert to authenticated with check (user_id = (select auth.uid()));
create policy documents_delete_own on public.documents for delete to authenticated using (user_id = (select auth.uid()));

grant insert (user_id, title, mode, status, clinician_name, source_description, source_document_id) on public.care_plans to authenticated;
grant update (title, status, clinician_name, source_description, source_document_id) on public.care_plans to authenticated;
create policy care_plans_insert_own on public.care_plans for insert to authenticated
  with check (user_id = (select auth.uid())
    and (source_document_id is null or exists (select 1 from public.documents d where d.id = source_document_id and d.user_id = (select auth.uid()))));
create policy care_plans_update_own on public.care_plans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant insert (plan_id, user_id, title, instructions, category, schedule_kind, times, weekdays, weekly_target, once_date,
              window_minutes, evidence_hint, status, provenance, source_document_id, source_page, source_snippet,
              unresolved_fields, allowed_alternatives) on public.plan_items to authenticated;
grant update (title, instructions, category, schedule_kind, times, weekdays, weekly_target, once_date, window_minutes,
              evidence_hint, status, unresolved_fields, allowed_alternatives) on public.plan_items to authenticated;
create policy plan_items_insert_own on public.plan_items for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.care_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy plan_items_update_own on public.plan_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant insert (user_id, occurrence_id, check_in_id, kind, document_id, text_content, transcript, content_hash, channel) on public.evidence to authenticated;
create policy evidence_insert_own on public.evidence for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.action_occurrences o where o.id = occurrence_id and o.user_id = (select auth.uid()))
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))));

grant insert (user_id, occurrence_id, evaluation_id, item_id, reason, source) on public.review_requests to authenticated;
create policy review_requests_insert_own on public.review_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'user'
    and (occurrence_id is null or exists (select 1 from public.action_occurrences o where o.id = occurrence_id and o.user_id = (select auth.uid()))));

grant update (status) on public.memory_facts to authenticated;
create policy memory_facts_update_own on public.memory_facts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and status in ('confirmed', 'rejected', 'superseded'));

grant update (status, opted_out_at) on public.channel_bindings to authenticated;
create policy channel_bindings_update_own on public.channel_bindings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant insert (user_id, title, target_points, baseline_points) on public.reward_goals to authenticated;
grant update (active, title) on public.reward_goals to authenticated;
create policy reward_goals_insert_own on public.reward_goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy reward_goals_update_own on public.reward_goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Family access: the patient manages rows; an accepted member can see only the row
-- itself (never patient data tables). Summaries come from family_summary() below.
grant select on public.family_access to authenticated;
grant insert (patient_id, invitee_label, invite_token_hash, scopes, expires_at) on public.family_access to authenticated;
grant update (status, revoked_at, scopes) on public.family_access to authenticated;
create policy family_access_patient_select on public.family_access for select to authenticated using (patient_id = (select auth.uid()));
create policy family_access_member_select on public.family_access for select to authenticated
  using (member_user_id = (select auth.uid()) and status = 'active');
create policy family_access_patient_insert on public.family_access for insert to authenticated with check (patient_id = (select auth.uid()));
create policy family_access_patient_update on public.family_access for update to authenticated
  using (patient_id = (select auth.uid())) with check (patient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- Clinician verification cannot be self-asserted by a client role.
create or replace function public.guard_care_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.clinician_verification = 'clinician_verified'
       and (tg_op = 'INSERT' or old.clinician_verification is distinct from 'clinician_verified') then
      raise exception 'clinician_verification_requires_approval_workflow' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.mode is distinct from old.mode) then
    raise exception 'plan_mode_is_immutable' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger care_plans_guard before insert or update on public.care_plans
  for each row execute function public.guard_care_plan();

-- Plan items: version every substantive change; a confirmed item cannot have its
-- schedule silently altered — it must return to draft and be explicitly re-confirmed.
create or replace function public.guard_plan_item() returns trigger
language plpgsql set search_path = '' as $$
declare
  schedule_changed boolean;
  content_changed boolean;
begin
  if tg_op = 'INSERT' then
    -- extracted items always start as drafts that the user must inspect and confirm
    if new.provenance = 'extracted' and new.status <> 'draft' then
      raise exception 'extracted_items_start_as_draft' using errcode = '22023';
    end if;
    if new.status = 'confirmed' then
      new.confirmed_at := now();
    end if;
    new.version := 1;
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id or new.user_id is distinct from old.user_id then
    raise exception 'plan_item_owner_immutable' using errcode = '42501';
  end if;

  schedule_changed := (new.schedule_kind, new.times, new.weekdays, new.weekly_target, new.once_date, new.window_minutes)
                      is distinct from (old.schedule_kind, old.times, old.weekdays, old.weekly_target, old.once_date, old.window_minutes);
  content_changed := schedule_changed
                     or (new.title, new.instructions, new.category, new.evidence_hint, new.allowed_alternatives, new.unresolved_fields)
                        is distinct from (old.title, old.instructions, old.category, old.evidence_hint, old.allowed_alternatives, old.unresolved_fields);

  if old.status = 'confirmed' and new.status = 'confirmed' and content_changed then
    raise exception 'confirmed_item_change_requires_reconfirmation' using errcode = '22023';
  end if;

  if content_changed or new.status is distinct from old.status then
    new.version := old.version + 1;
  end if;
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    new.confirmed_at := now();
  elsif new.status <> 'confirmed' then
    new.confirmed_at := null;
  end if;
  return new;
end $$;
create trigger plan_items_guard before insert or update on public.plan_items
  for each row execute function public.guard_plan_item();

-- Append-only history (written with definer rights; clients can only read it).
create or replace function public.record_plan_item_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kind text;
  via text := coalesce(nullif(current_setting('sukhi.change_via', true), ''), 'user');
begin
  if tg_op = 'INSERT' then
    kind := 'created';
    if new.provenance = 'extracted' then via := 'extraction'; end if;
  elsif new.version = old.version then
    return new;
  elsif new.status = 'confirmed' and old.status <> 'confirmed' then
    kind := 'confirmed';
  elsif new.status = 'paused' and old.status <> 'paused' then
    kind := 'paused';
  elsif old.status = 'paused' and new.status <> 'paused' and new.status <> 'retired' then
    kind := 'resumed';
  elsif new.status = 'retired' then
    kind := 'retired';
  else
    kind := 'edited';
  end if;
  if via not in ('user', 'assistant_proposal', 'system', 'extraction') then via := 'user'; end if;
  insert into public.plan_item_versions (item_id, user_id, version, change_kind, changed_via, snapshot)
  values (new.id, new.user_id, new.version, kind, via, to_jsonb(new) - 'user_id')
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.record_plan_item_version() from public, anon, authenticated;
create trigger plan_items_version after insert or update on public.plan_items
  for each row execute function public.record_plan_item_version();

-- Pausing/retiring an item or plan pauses its open future occurrences and cancels reminders.
create or replace function public.cascade_item_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('paused', 'retired', 'draft') and old.status = 'confirmed' then
    update public.action_occurrences
       set status = 'paused', status_changed_at = now()
     where item_id = new.id and status in ('pending', 'due', 'awaiting_response', 'later') and window_end_at > now();
    update public.jobs set status = 'cancelled', last_error = 'item_state_changed'
     where kind = 'reminder' and status = 'queued' and (payload ->> 'item_id') = new.id::text;
  end if;
  return new;
end $$;
revoke all on function public.cascade_item_state() from public, anon, authenticated;
create trigger plan_items_cascade after update of status on public.plan_items
  for each row execute function public.cascade_item_state();

create or replace function public.cascade_plan_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('paused', 'archived') and old.status = 'active' then
    update public.action_occurrences
       set status = 'paused', status_changed_at = now()
     where plan_id = new.id and status in ('pending', 'due', 'awaiting_response', 'later') and window_end_at > now();
    update public.jobs set status = 'cancelled', last_error = 'plan_state_changed'
     where kind = 'reminder' and status = 'queued' and (payload ->> 'plan_id') = new.id::text;
  end if;
  return new;
end $$;
revoke all on function public.cascade_plan_state() from public, anon, authenticated;
create trigger care_plans_cascade after update of status on public.care_plans
  for each row execute function public.cascade_plan_state();

-- Family revocation takes effect immediately: status is checked on every summary call.
create or replace function public.guard_family_access() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.status not in ('revoked') and new.status is distinct from old.status then
      raise exception 'patient_may_only_revoke' using errcode = '42501';
    end if;
    if old.status = 'revoked' and new.status <> 'revoked' then
      raise exception 'revoked_access_cannot_be_restored' using errcode = '42501';
    end if;
  end if;
  if new.status = 'revoked' and old.status <> 'revoked' then
    new.revoked_at := now();
  end if;
  return new;
end $$;
create trigger family_access_guard before update on public.family_access
  for each row execute function public.guard_family_access();
