-- Claim time-sensitive work first. Previously jobs were claimed strictly by run_at, so a
-- daily burst of generate_occurrences jobs (one per user) could delay due reminders,
-- inbound WhatsApp processing and outbound sends by several worker ticks.
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
     order by case kind
                when 'process_inbound' then 0
                when 'send_outbound' then 0
                when 'reminder' then 1
                when 'evaluate_evidence' then 2
                else 3
              end,
              run_at
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

revoke all on function public.claim_jobs(text, int, int) from public, anon, authenticated;
grant execute on function public.claim_jobs(text, int, int) to service_role;
