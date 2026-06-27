/*
  Create daily cron job to process membership renewal notifications.
  Runs at 21:00 UTC (7:00 AM AEST) every day.
  Scans all clubs for members approaching their renewal date and sends
  email + in-app notifications at 30, 14, 7, 1 days before expiry, and on expiry.
*/

-- Remove existing job if it exists (safe check)
DO $$
BEGIN
  PERFORM cron.unschedule('process-renewal-notifications');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Create daily cron job at 21:00 UTC (7:00 AM AEST)
SELECT cron.schedule(
  'process-renewal-notifications',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/process-renewal-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
