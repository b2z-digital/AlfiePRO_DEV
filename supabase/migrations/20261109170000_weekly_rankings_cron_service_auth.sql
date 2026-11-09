-- The weekly rankings job called sync-rankings-weekly with only an X-Cron-Secret header.
-- That function requires a JWT, so every run since Feb 2026 was rejected and rankings never
-- refreshed. Call it the same way as the other scraper jobs (service key from the vault).
-- (Applied to production on 9 Nov 2026 with cron.alter_job.)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'weekly-rankings-sync'),
  command := $cmd$
SELECT net.http_post(
url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/sync-rankings-weekly',
headers := jsonb_build_object(
'Content-Type', 'application/json',
'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
),
body := '{}'::jsonb,
timeout_milliseconds := 300000
);
$cmd$
);
