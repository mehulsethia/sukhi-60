-- Device readings read from proof photos, and a 7-day retention for proof media.

-- 1. Readings: numbers transcribed from a measuring device's display (or typed as a fix).
create table if not exists public.readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_id uuid references public.action_occurrences (id) on delete set null,
  item_id uuid references public.plan_items (id) on delete set null,
  evidence_id uuid unique references public.evidence (id) on delete set null,
  kind text not null check (kind in ('blood_pressure', 'glucose', 'weight', 'temperature', 'spo2')),
  value numeric(6, 1) not null,
  value2 numeric(6, 1),
  pulse int check (pulse between 30 and 220),
  unit text not null check (unit in ('mmHg', 'mg/dL', 'mmol/L', 'kg', 'lb', '°C', '°F', '%')),
  source text not null default 'photo' check (source in ('photo', 'corrected')),
  read_as jsonb, -- what the AI read, kept when the person corrects it
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists readings_user_time on public.readings (user_id, measured_at desc);
alter table public.readings enable row level security;
alter table public.readings force row level security;
revoke all on public.readings from anon, authenticated;
grant select on public.readings to authenticated;
grant all on public.readings to service_role;
drop policy if exists readings_select_own on public.readings;
create policy readings_select_own on public.readings for select to authenticated using (user_id = (select auth.uid()));

-- 2. Retention: when a proof file was deleted (the evidence row, its fingerprints and every
-- decision stay, so reuse checks and the audit trail keep working).
alter table public.documents add column if not exists purged_at timestamptz;

-- Proof files past retention. A file whose review is still undecided is held for the reviewer,
-- up to p_hold_max. Age is the storage object's last write, so a re-upload restarts the clock.
create or replace function public.expired_evidence_files(p_older_than interval default '7 days', p_hold_max interval default '30 days', p_limit int default 500)
returns table (document_id uuid, name text)
language sql security definer set search_path = '' stable as $$
  select d.id, o.name
    from storage.objects o
    join public.documents d on d.bucket = 'evidence' and d.storage_path = o.name
   where o.bucket_id = 'evidence'
     and greatest(o.created_at, coalesce(o.updated_at, o.created_at)) < now() - p_older_than
     and (
       greatest(o.created_at, coalesce(o.updated_at, o.created_at)) < now() - p_hold_max
       or not exists (
         select 1
           from public.evidence e
           join public.review_requests r on r.status in ('open', 'waiting_patient')
             and (r.evidence_id = e.id or r.evaluation_id in (select v.id from public.evaluations v where v.evidence_id = e.id))
          where e.document_id = d.id
       )
     )
   order by o.created_at
   limit greatest(1, least(p_limit, 1000));
$$;
revoke all on function public.expired_evidence_files(interval, interval, int) from public, anon, authenticated;
grant execute on function public.expired_evidence_files(interval, interval, int) to service_role;
