-- Sukhi 60 core schema.
-- All patient-owned tables carry user_id -> auth.users(id) and are protected by RLS (see 0200).
-- Canonical timestamps are timestamptz (UTC); the user's IANA timezone is stored on profiles
-- and copied onto occurrences/check-ins as local_date for stable day accounting.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.app_locale as enum ('en', 'hi', 'mr');
create type public.plan_mode as enum ('clinician_instructions', 'personal_goal');
create type public.clinician_verification as enum ('user_transcribed', 'clinician_verified');
create type public.plan_status as enum ('draft', 'active', 'paused', 'archived');
create type public.item_status as enum ('draft', 'confirmed', 'paused', 'retired');
create type public.item_category as enum ('medication', 'activity', 'measurement', 'nutrition', 'appointment', 'rest', 'other');
create type public.schedule_kind as enum ('daily', 'weekdays', 'weekly_target', 'once');
create type public.evidence_hint as enum ('none', 'photo', 'text', 'any');
create type public.item_provenance as enum ('manual', 'extracted', 'template');

-- Occurrence lifecycle. Silence ("no_response") is deliberately distinct from an explicit
-- user-reported miss ("missed").
create type public.occurrence_status as enum (
  'pending',            -- scheduled, not yet in its window
  'due',                -- inside its window, nothing recorded
  'awaiting_response',  -- reminder sent, nothing recorded
  'later',              -- user asked to be reminded later
  'self_reported',      -- user said done; no supporting evidence assessed
  'evidence_supported', -- evidence assessed as supporting the observable part of the action
  'needs_review',       -- evidence unclear / contradictory / user requested review
  'skipped',            -- user explicitly skipped (optional reason)
  'unable',             -- user reported unable / unwell
  'missed',             -- user explicitly reported a miss
  'paused',             -- plan or item paused
  'no_response'         -- defined silence rule applied (window elapsed); NOT counted as missed
);

create type public.check_in_kind as enum ('done', 'later', 'skipped', 'unable', 'missed', 'note');
create type public.channel_kind as enum ('web', 'whatsapp', 'assistant', 'system');
create type public.evidence_kind as enum ('photo', 'audio', 'text', 'document');
create type public.evaluation_method as enum ('rule', 'model', 'manual_review');
create type public.evaluation_outcome as enum ('supports', 'partially_supports', 'does_not_support', 'unclear', 'not_applicable');
create type public.message_role as enum ('user', 'assistant', 'notice');
create type public.memory_kind as enum ('preference', 'barrier', 'context', 'open_question', 'summary');
create type public.memory_status as enum ('proposed', 'confirmed', 'superseded', 'rejected');
create type public.consent_kind as enum ('ai_processing', 'reminders', 'whatsapp', 'family_sharing', 'voice_processing');
create type public.job_kind as enum ('reminder', 'process_inbound', 'evaluate_evidence', 'send_outbound', 'generate_occurrences', 'apply_silence_rule');
create type public.job_status as enum ('queued', 'running', 'done', 'failed', 'dead', 'cancelled');
create type public.outbound_status as enum ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'uncertain', 'cancelled');
create type public.reward_kind as enum ('participation', 'completion', 'evidence_bonus', 'return', 'milestone');
create type public.family_status as enum ('invited', 'active', 'revoked', 'expired');
create type public.binding_status as enum ('active', 'paused', 'revoked');

-- ---------------------------------------------------------------------------
-- Profiles & consent
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  locale public.app_locale not null default 'en',
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 1 and 64),
  checkin_times text[] not null default array['09:00', '19:00']
    check (array_length(checkin_times, 1) is null or array_length(checkin_times, 1) <= 6),
  quiet_start text not null default '21:30' check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text not null default '07:30' check (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reminder_frequency text not null default 'normal' check (reminder_frequency in ('normal', 'gentle', 'off')),
  accessibility jsonb not null default '{"large_text": false, "reduce_motion": false, "audio_replies": false, "high_contrast": false}'::jsonb,
  limitations text check (char_length(limitations) <= 1000),
  care_notes text check (char_length(care_notes) <= 2000),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.consent_kind not null,
  granted boolean not null,
  policy_version text not null default '2026-11-v1',
  granted_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- ---------------------------------------------------------------------------
-- Plans, items, versions, documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket in ('plan-sources', 'evidence')),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'text/plain')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  original_name text check (char_length(original_name) <= 200),
  extraction_status text not null default 'none' check (extraction_status in ('none', 'pending', 'done', 'failed', 'unavailable')),
  extraction jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, bucket, storage_path),
  -- the storage path must live under the owner's folder
  check (split_part(storage_path, '/', 1) = user_id::text)
);

create table public.care_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  mode public.plan_mode not null,
  status public.plan_status not null default 'draft',
  -- A user transcribing / ticking a box is NOT clinician verification.
  clinician_verification public.clinician_verification not null default 'user_transcribed',
  clinician_name text check (char_length(clinician_name) <= 120),
  source_description text check (char_length(source_description) <= 500),
  source_document_id uuid references public.documents (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.care_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  instructions text check (char_length(instructions) <= 1000),
  category public.item_category not null default 'other',
  schedule_kind public.schedule_kind not null default 'daily',
  times text[] not null default '{}'
    check (array_length(times, 1) is null or array_length(times, 1) <= 8),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  weekly_target smallint check (weekly_target is null or weekly_target between 1 and 7),
  once_date date,
  window_minutes integer not null default 180 check (window_minutes between 15 and 1440),
  evidence_hint public.evidence_hint not null default 'none',
  status public.item_status not null default 'draft',
  provenance public.item_provenance not null default 'manual',
  source_document_id uuid references public.documents (id) on delete set null,
  source_page integer check (source_page is null or source_page > 0),
  source_snippet text check (char_length(source_snippet) <= 1000),
  -- names of fields the extractor could not read with confidence; must be empty to confirm
  unresolved_fields text[] not null default '{}',
  allowed_alternatives text check (char_length(allowed_alternatives) <= 500),
  version integer not null default 1,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (schedule_kind <> 'weekly_target' or weekly_target is not null),
  check (schedule_kind <> 'weekdays' or array_length(weekdays, 1) >= 1),
  check (schedule_kind <> 'once' or once_date is not null),
  check (status <> 'confirmed' or coalesce(array_length(unresolved_fields, 1), 0) = 0)
);

create table public.plan_item_versions (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.plan_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  change_kind text not null check (change_kind in ('created', 'edited', 'confirmed', 'paused', 'resumed', 'retired', 'reminder_changed')),
  changed_via text not null default 'user' check (changed_via in ('user', 'assistant_proposal', 'system', 'extraction')),
  reason text check (char_length(reason) <= 500),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (item_id, version, change_kind)
);

-- Assistant-proposed changes that require an explicit user confirmation.
create table public.change_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.plan_items (id) on delete cascade,
  item_version integer not null,
  confirm_code text not null check (confirm_code ~ '^[A-Z0-9]{4,8}$'),
  change jsonb not null,
  summary text not null check (char_length(summary) <= 500),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'expired', 'stale')),
  expires_at timestamptz not null default now() + interval '1 day',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Occurrences, check-ins, evidence, evaluations
-- ---------------------------------------------------------------------------
create table public.action_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.plan_items (id) on delete cascade,
  plan_id uuid not null references public.care_plans (id) on delete cascade,
  item_version integer not null,
  due_at timestamptz not null,
  window_end_at timestamptz not null,
  local_date date not null,
  local_time text,
  timezone text not null,
  -- weekly targets: one occurrence per ISO week, counted by distinct local days
  target_count smallint not null default 1 check (target_count between 1 and 7),
  completed_count smallint not null default 0 check (completed_count >= 0),
  status public.occurrence_status not null default 'pending',
  snooze_until timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (item_id, due_at),
  check (window_end_at > due_at)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_id uuid not null references public.action_occurrences (id) on delete cascade,
  kind public.check_in_kind not null,
  reason text check (char_length(reason) <= 300),
  note text check (char_length(note) <= 1000),
  channel public.channel_kind not null default 'web',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  local_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_id uuid not null references public.action_occurrences (id) on delete cascade,
  check_in_id uuid references public.check_ins (id) on delete set null,
  kind public.evidence_kind not null,
  document_id uuid references public.documents (id) on delete set null,
  text_content text check (char_length(text_content) <= 2000),
  transcript text check (char_length(transcript) <= 4000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  channel public.channel_kind not null default 'web',
  created_at timestamptz not null default now(),
  -- the same evidence cannot be submitted twice for the same occurrence
  unique (occurrence_id, content_hash)
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_id uuid not null references public.action_occurrences (id) on delete cascade,
  evidence_id uuid references public.evidence (id) on delete cascade,
  method public.evaluation_method not null,
  outcome public.evaluation_outcome not null,
  observed text[] not null default '{}',
  cannot_confirm text[] not null default '{}',
  explanation text not null check (char_length(explanation) <= 1500),
  model_id text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (evidence_id, method)
);

create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_id uuid references public.action_occurrences (id) on delete cascade,
  evaluation_id uuid references public.evaluations (id) on delete set null,
  item_id uuid references public.plan_items (id) on delete set null,
  reason text not null check (char_length(reason) <= 500),
  source text not null default 'user' check (source in ('user', 'evaluator', 'assistant', 'safety')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversations, messages, memory
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.message_role not null,
  channel public.channel_kind not null,
  content text not null check (char_length(content) <= 8000),
  source_refs jsonb not null default '[]'::jsonb,
  provider_message_id text unique,
  safety_flag text check (safety_flag in ('escalation', 'injection_suspected', 'missing_info')),
  created_at timestamptz not null default now()
);

create table public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.memory_kind not null,
  content text not null check (char_length(content) <= 500),
  source_type text not null check (source_type in ('onboarding', 'user_message', 'check_in', 'assistant_summary', 'settings')),
  source_id uuid,
  status public.memory_status not null default 'proposed',
  superseded_by uuid references public.memory_facts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Messaging channels
-- ---------------------------------------------------------------------------
create table public.channel_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  external_id text not null check (external_id ~ '^[0-9]{6,20}$'),
  status public.binding_status not null default 'active',
  opted_in_at timestamptz not null default now(),
  opted_out_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one WhatsApp number can be bound to at most one non-revoked account, and vice versa
create unique index channel_bindings_external_active on public.channel_bindings (channel, external_id) where status <> 'revoked';
create unique index channel_bindings_user_active on public.channel_bindings (user_id, channel) where status <> 'revoked';

create table public.link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null default 'link' check (purpose in ('link', 'rebind')),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_external_hash text,
  created_at timestamptz not null default now()
);

-- Raw provider events, persisted before acknowledgement. Deduplicated by provider id.
create table public.inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'whatsapp',
  provider_event_id text not null,
  event_type text not null check (event_type in ('message', 'status', 'other')),
  from_external_id text,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id, event_type)
);

create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  binding_id uuid references public.channel_bindings (id) on delete set null,
  channel text not null default 'whatsapp',
  kind text not null check (kind in ('free_text', 'template')),
  template_name text,
  body text not null check (char_length(body) <= 4096),
  status public.outbound_status not null default 'queued',
  provider_message_id text unique,
  attempts integer not null default 0,
  error_code text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Durable jobs (outbox / work queue)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  kind public.job_kind not null,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  locked_until timestamptz,
  locked_by text,
  plan_item_version integer,
  last_error text check (char_length(last_error) <= 500),
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Encouragement
-- ---------------------------------------------------------------------------
create table public.reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.reward_kind not null,
  occurrence_id uuid references public.action_occurrences (id) on delete set null,
  points smallint not null check (points between 0 and 10),
  local_date date not null,
  week_start date not null,
  label text not null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.reward_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  target_points integer not null check (target_points between 5 and 500),
  baseline_points integer not null default 0,
  achieved_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index reward_goals_one_active on public.reward_goals (user_id) where active;

-- ---------------------------------------------------------------------------
-- Family support (patient-controlled, summary-only)
-- ---------------------------------------------------------------------------
create table public.family_access (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  member_user_id uuid references auth.users (id) on delete cascade,
  invitee_label text not null check (char_length(invitee_label) between 1 and 80),
  invite_token_hash text not null unique check (invite_token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default array['weekly_summary'] check (scopes <@ array['weekly_summary', 'garden']),
  status public.family_status not null default 'invited',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (member_user_id is null or member_user_id <> patient_id)
);

-- ---------------------------------------------------------------------------
-- Observability
-- ---------------------------------------------------------------------------
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel public.channel_kind not null,
  route text not null check (route in ('escalation', 'quick_action', 'model', 'fallback', 'confirmation', 'blocked')),
  tools jsonb not null default '[]'::jsonb,
  outcome text not null check (outcome in ('ok', 'error', 'timeout', 'budget_exceeded', 'unconfigured')),
  latency_ms integer not null default 0,
  model_id text,
  error_code text check (char_length(error_code) <= 120),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  actor text not null check (actor in ('user', 'assistant', 'system', 'family_member', 'worker')),
  action text not null check (char_length(action) <= 80),
  entity text not null check (char_length(entity) <= 60),
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes for patient/time queries and job claims
-- ---------------------------------------------------------------------------
create index consents_user on public.consents (user_id);
create index documents_user on public.documents (user_id, created_at desc);
create index care_plans_user on public.care_plans (user_id, status);
create index plan_items_plan on public.plan_items (plan_id);
create index plan_items_user_status on public.plan_items (user_id, status);
create index plan_item_versions_item on public.plan_item_versions (item_id, version);
create index change_proposals_user on public.change_proposals (user_id, status);
create index occurrences_user_date on public.action_occurrences (user_id, local_date);
create index occurrences_user_due on public.action_occurrences (user_id, due_at);
create index occurrences_open_window on public.action_occurrences (window_end_at)
  where status in ('pending', 'due', 'awaiting_response', 'later');
create index check_ins_occurrence on public.check_ins (occurrence_id, created_at);
create index check_ins_user_date on public.check_ins (user_id, local_date);
create index evidence_occurrence on public.evidence (occurrence_id);
create index evaluations_occurrence on public.evaluations (occurrence_id, created_at desc);
create index review_requests_user on public.review_requests (user_id, status);
create index messages_user_time on public.messages (user_id, created_at desc);
create index memory_facts_user on public.memory_facts (user_id, status);
create index link_codes_user on public.link_codes (user_id, created_at desc);
create index inbound_events_status on public.inbound_events (status, received_at);
create index outbound_user on public.outbound_messages (user_id, created_at desc);
create index outbound_status on public.outbound_messages (status, updated_at);
create index jobs_claim on public.jobs (run_at) where status = 'queued';
create index jobs_lease on public.jobs (locked_until) where status = 'running';
create index jobs_user on public.jobs (user_id, kind);
create index reward_events_user_date on public.reward_events (user_id, local_date);
create index reward_events_user_week on public.reward_events (user_id, week_start);
create index family_access_patient on public.family_access (patient_id, status);
create index family_access_member on public.family_access (member_user_id, status);
create index agent_runs_user on public.agent_runs (user_id, created_at desc);
create index audit_events_user on public.audit_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger consents_touch before update on public.consents for each row execute function public.touch_updated_at();
create trigger care_plans_touch before update on public.care_plans for each row execute function public.touch_updated_at();
create trigger plan_items_touch before update on public.plan_items for each row execute function public.touch_updated_at();
create trigger memory_facts_touch before update on public.memory_facts for each row execute function public.touch_updated_at();
create trigger channel_bindings_touch before update on public.channel_bindings for each row execute function public.touch_updated_at();
create trigger outbound_touch before update on public.outbound_messages for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

-- New auth user -> empty profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
