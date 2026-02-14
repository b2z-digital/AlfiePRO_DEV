/*
  # Automated Monthly Billing Generation

  1. Changes
    - Creates a cron job that runs on the 1st of each month at midnight UTC
    - Automatically calls the generate-platform-billing edge function
    - Uses pg_net extension for HTTP calls from within the database

  2. How It Works
    - On the 1st of each month, the cron job fires
    - It calls the generate-platform-billing edge function via HTTP POST
    - The edge function generates billing records for the current month
    - No manual intervention required

  3. Important Notes
    - Manual generation from the UI still works for ad-hoc or re-generation
    - Finalized periods cannot be overwritten even by the cron job
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('generate-monthly-platform-billing');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'generate-monthly-platform-billing',
  '0 0 1 * *',
  $$
  SELECT extensions.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-platform-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
