-- Proof verification: reuse detection, fresh-photo challenges, proof levels, appeals and a
-- human review queue. The AI describes; fixed rules and, where needed, a human decide.

-- 1. Evidence fingerprints (exact hash already exists; phash catches cropped/re-saved copies).
alter table public.evidence
  add column if not exists phash text check (phash ~ '^[0-9a-f]{16}$'),
  add column if not exists taken_at timestamptz,
  add column if not exists challenge_id uuid;
create index if not exists evidence_user_phash on public.evidence (user_id, created_at desc) where phash is not null;
create index if not exists evidence_hash on public.evidence (content_hash);

-- 2. Fresh-photo challenges: one random instruction per task ("show 3 fingers next to it").
create table if not exists public.proof_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_id uuid not null references public.action_occurrences (id) on delete cascade,
  kind text not null check (kind in ('fingers', 'code')),
  value text not null check (char_length(value) between 1 and 8),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists proof_challenges_occ on public.proof_challenges (occurrence_id, created_at desc);
alter table public.proof_challenges enable row level security;
alter table public.proof_challenges force row level security;
revoke all on public.proof_challenges from anon, authenticated;
grant all on public.proof_challenges to service_role;

-- 3. What each evaluation found, and how strong the proof is.
alter table public.evaluations
  add column if not exists flags text[] not null default '{}',
  add column if not exists flag_detail jsonb not null default '{}'::jsonb,
  add column if not exists challenge_met boolean,
  add column if not exists label_match text check (label_match in ('yes', 'no', 'not_visible')),
  add column if not exists blister_empty int check (blister_empty between 0 and 100),
  add column if not exists proof_level text check (proof_level in ('photo_ai', 'photo_fresh', 'video_action', 'human_verified', 'flagged')),
  add column if not exists reviewer text check (char_length(reviewer) <= 120);

-- Strongest proof on each task (null = the person's word only).
alter table public.action_occurrences
  add column if not exists proof_level text check (proof_level in ('photo_ai', 'photo_fresh', 'video_action', 'human_verified', 'flagged'));

-- 4. Review requests become a real queue: appeals, flags, audits; decisions recorded.
alter table public.review_requests drop constraint if exists review_requests_source_check;
alter table public.review_requests add constraint review_requests_source_check check (source in ('user', 'evaluator', 'assistant', 'safety', 'appeal', 'flag', 'audit'));
alter table public.review_requests drop constraint if exists review_requests_status_check;
alter table public.review_requests add constraint review_requests_status_check check (status in ('open', 'waiting_patient', 'resolved', 'dismissed'));
alter table public.review_requests
  add column if not exists evidence_id uuid references public.evidence (id) on delete set null,
  add column if not exists patient_note text check (char_length(patient_note) <= 500),
  add column if not exists decision text check (decision in ('verified', 'rejected', 'more_photo', 'dismissed')),
  add column if not exists decision_note text check (char_length(decision_note) <= 500),
  add column if not exists decided_by text check (char_length(decided_by) <= 120),
  add column if not exists decided_at timestamptz;
create index if not exists review_requests_queue on public.review_requests (status, created_at);

-- 5. Applying a verdict. Changes from the first version:
--  - a matched photo that can only "partly" show the act (a pill strip, a plate) now counts as
--    done with photo proof; its proof level says how strong it is.
--  - a reviewer's decision (method manual_review) is final: supports -> verified, otherwise the
--    task falls back to the person's own report.
create or replace function public.apply_evaluation_internal(p_evaluation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.evaluations;
  occ public.action_occurrences;
  new_status public.occurrence_status;
  rewards jsonb := '[]'::jsonb;
  r jsonb;
  ldate date;
  reported boolean;
begin
  select * into ev from public.evaluations where id = p_evaluation;
  if not found then raise exception 'evaluation_not_found' using errcode = 'P0002'; end if;
  select * into occ from public.action_occurrences where id = ev.occurrence_id for update;
  if occ.user_id <> ev.user_id then raise exception 'ownership_mismatch' using errcode = '42501'; end if;
  ldate := (now() at time zone occ.timezone)::date;
  new_status := occ.status;
  select exists (select 1 from public.check_ins c where c.occurrence_id = occ.id and c.kind = 'done') into reported;

  if ev.method = 'manual_review' then
    if ev.outcome = 'supports' then
      if occ.status <> 'paused' then new_status := 'evidence_supported'; end if;
    elsif occ.status in ('needs_review', 'evidence_supported') then
      new_status := case when reported then 'self_reported'::public.occurrence_status else 'no_response'::public.occurrence_status end;
    end if;
  elsif ev.outcome in ('supports', 'partially_supports') and not ev.needs_review then
    if occ.status not in ('paused') then new_status := 'evidence_supported'; end if;
  elsif ev.outcome = 'not_applicable' or (ev.outcome = 'unclear' and not ev.needs_review) then
    null;  -- saved, described where possible, no status change
  else
    if occ.status not in ('evidence_supported', 'paused') then new_status := 'needs_review'; end if;
    insert into public.review_requests (user_id, occurrence_id, evaluation_id, evidence_id, item_id, reason, source)
    values (occ.user_id, occ.id, ev.id, ev.evidence_id, occ.item_id,
            case when array_length(ev.flags, 1) > 0 then 'Flagged: ' || array_to_string(ev.flags, ', ') else 'Evidence could not be assessed clearly' end,
            case when array_length(ev.flags, 1) > 0 then 'flag' else 'evaluator' end);
  end if;

  if new_status = 'evidence_supported' and occ.status <> 'evidence_supported' then
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

  -- Proof level on the task: the strongest so far; a reviewer's decision replaces it.
  if ev.proof_level is not null then
    update public.action_occurrences set proof_level = case
      when ev.method = 'manual_review' then ev.proof_level
      when proof_level is null or proof_level = 'flagged' then ev.proof_level
      when ev.proof_level = 'flagged' then proof_level
      when array_position(array['photo_ai', 'photo_fresh', 'video_action', 'human_verified'], ev.proof_level)
         > array_position(array['photo_ai', 'photo_fresh', 'video_action', 'human_verified'], proof_level) then ev.proof_level
      else proof_level end
    where id = occ.id;
  end if;

  if new_status is distinct from occ.status then
    update public.action_occurrences set status = new_status, status_changed_at = now() where id = occ.id;
  end if;
  return jsonb_build_object('status', new_status, 'rewards', rewards);
end $$;
revoke all on function public.apply_evaluation_internal(uuid) from public, anon, authenticated;
grant execute on function public.apply_evaluation_internal(uuid) to service_role;
