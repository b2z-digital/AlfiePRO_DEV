/*
  # Create Weekly Rankings Sync Cron Job

  1. Cron Job Details
    - Runs every Sunday at 2:00 AM (to minimize impact)
    - Automatically fetches rankings from radiosailing.org.au
    - Syncs all yacht classes (IOM, 10R, Marblehead, A Class, DF65, DF95)
    - Updates rankings for all national associations
  
  2. Security
    - Uses internal function call
    - No authentication required (system-initiated task)
*/

-- Remove any existing rankings sync job
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-rankings-sync');
EXCEPTION
  WHEN undefined_table THEN
    -- pg_cron not installed, skip
    NULL;
  WHEN OTHERS THEN
    -- Job doesn't exist or other error, continue
    NULL;
END $$;

-- Create weekly cron job to sync national rankings
-- Runs every Sunday at 2:00 AM
DO $$
DECLARE
  supabase_url text;
  job_command text;
BEGIN
  -- Get Supabase URL from environment
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  IF supabase_url IS NULL THEN
    -- Fallback to a placeholder that will be replaced
    supabase_url := 'https://your-project.supabase.co';
  END IF;

  -- Build the command
  job_command := format(
    'SELECT net.http_post(url := ''%s/functions/v1/sync-rankings-weekly'', headers := ''{"Content-Type": "application/json", "X-Cron-Secret": "internal-cron-job"}''::jsonb, body := ''{}''::jsonb);',
    supabase_url
  );

  -- Schedule the job
  PERFORM cron.schedule(
    'weekly-rankings-sync',
    '0 2 * * 0',
    job_command
  );
  
  RAISE NOTICE 'Weekly rankings sync cron job created successfully';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron extension not available. Please enable it in the Supabase dashboard under Database > Extensions.';
  WHEN undefined_function THEN
    RAISE NOTICE 'Required extensions (pg_cron or pg_net) not available. Please enable them in the Supabase dashboard.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error creating cron job: %', SQLERRM;
END $$;
