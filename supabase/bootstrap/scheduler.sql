-- Sukhi scheduler bootstrap — run ONCE per Supabase project with elevated privileges
-- (Supabase Dashboard -> SQL Editor). Not a migration: it needs Vault + extension rights the
-- application runtime never has. Re-running is safe (secrets/job are replaced).
--
-- BEFORE running, replace the two placeholders below in the editor only. Never commit them.
--   <APP_URL>        e.g. https://sukhi-60.vercel.app   (no trailing slash)
--   <WORKER_SECRET>  the same value as the WORKER_SECRET env var in Vercel

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the target URL and bearer secret in Vault (encrypted at rest).
do $$
begin
  perform vault.update_secret(id, '<APP_URL>') from vault.secrets where name = 'sukhi_app_url';
  if not found then perform vault.create_secret('<APP_URL>', 'sukhi_app_url', 'Sukhi app base URL'); end if;
  perform vault.update_secret(id, '<WORKER_SECRET>') from vault.secrets where name = 'sukhi_worker_secret';
  if not found then perform vault.create_secret('<WORKER_SECRET>', 'sukhi_worker_secret', 'Bearer for /api/worker/tick'); end if;
end $$;

-- Every minute: call the secured worker endpoint. The endpoint claims a bounded batch of
-- durable jobs with leases, so overlapping or missed ticks are safe.
select cron.unschedule('sukhi-worker-tick') where exists (select 1 from cron.job where jobname = 'sukhi-worker-tick');
select cron.schedule(
  'sukhi-worker-tick',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sukhi_app_url') || '/api/worker/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sukhi_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- Observe:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--   select status_code, left(content::text, 200), created from net._http_response order by created desc limit 10;
-- Disable:
--   select cron.unschedule('sukhi-worker-tick');
