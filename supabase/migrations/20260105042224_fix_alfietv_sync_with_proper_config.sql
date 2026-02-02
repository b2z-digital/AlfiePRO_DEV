/*
  # Fix AlfieTV Auto-Sync Configuration

  1. Changes
    - Drop and recreate sync function with better error handling
    - Add configuration check
    - Create cron-friendly wrapper

  2. Notes
    - Requires Supabase URL and anon key configuration
*/

-- Drop existing function
DROP FUNCTION IF EXISTS sync_all_alfietv_channels();

-- Create an improved sync function that handles configuration better
CREATE OR REPLACE FUNCTION sync_all_alfietv_channels()
RETURNS TABLE(
  channel_id uuid,
  channel_name text,
  sync_triggered boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_record RECORD;
  request_id BIGINT;
  supabase_url TEXT;
  supabase_key TEXT;
BEGIN
  -- Try to get Supabase URL and key from configuration
  -- These should be set using: ALTER DATABASE postgres SET app.supabase_url = 'your-url';
  BEGIN
    supabase_url := current_setting('app.supabase_url', true);
    supabase_key := current_setting('app.supabase_anon_key', true);
  EXCEPTION WHEN OTHERS THEN
    -- If settings don't exist, log and return
    RAISE WARNING 'Supabase configuration not found. Please run: ALTER DATABASE postgres SET app.supabase_url = ''https://your-project.supabase.co'';';
    RETURN;
  END;

  -- Validate configuration
  IF supabase_url IS NULL OR supabase_key IS NULL THEN
    RAISE WARNING 'Supabase URL or key not configured. Set with ALTER DATABASE commands.';
    RETURN;
  END IF;

  -- Loop through all channels with auto_import enabled
  FOR channel_record IN 
    SELECT c.id, c.channel_name, c.last_imported_at
    FROM alfie_tv_channels c
    WHERE c.auto_import = true
    ORDER BY COALESCE(c.last_imported_at, '1970-01-01'::timestamptz) ASC
    LIMIT 10 -- Sync max 10 channels per run to avoid API rate limits
  LOOP
    BEGIN
      -- Call the sync-youtube-channel edge function using pg_net
      SELECT net.http_post(
        url := supabase_url || '/functions/v1/sync-youtube-channel',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || supabase_key
        ),
        body := jsonb_build_object('channelId', channel_record.id::text),
        timeout_milliseconds := 60000
      ) INTO request_id;
      
      -- Return success
      channel_id := channel_record.id;
      channel_name := channel_record.channel_name;
      sync_triggered := true;
      error_message := NULL;
      RETURN NEXT;
      
      -- Log successful trigger
      RAISE NOTICE 'Triggered sync for channel: % (ID: %)', channel_record.channel_name, channel_record.id;
      
    EXCEPTION WHEN OTHERS THEN
      -- Return error but continue with other channels
      channel_id := channel_record.id;
      channel_name := channel_record.channel_name;
      sync_triggered := false;
      error_message := SQLERRM;
      RETURN NEXT;
      
      RAISE WARNING 'Failed to trigger sync for channel %: %', channel_record.id, SQLERRM;
    END;
    
    -- Small delay between requests to avoid rate limiting (100ms)
    PERFORM pg_sleep(0.1);
  END LOOP;
END;
$$;

-- Create a simpler version that doesn't require return values for cron
CREATE OR REPLACE FUNCTION sync_all_alfietv_channels_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Just call the main function and discard results
  PERFORM * FROM sync_all_alfietv_channels();
  
  RAISE NOTICE 'AlfieTV auto-sync completed at %', now();
END;
$$;

-- Update the cron job to use the simpler version
DO $$
BEGIN
  -- Try to unschedule if exists
  PERFORM cron.unschedule('alfietv-daily-sync');
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if doesn't exist
END $$;

-- Schedule the job
SELECT cron.schedule(
  'alfietv-daily-sync',
  '0 2 * * *', -- Run at 2 AM every day
  $$SELECT sync_all_alfietv_channels_cron()$$
);

-- Add helpful comments
COMMENT ON FUNCTION sync_all_alfietv_channels IS 'Syncs all AlfieTV channels with auto_import enabled and returns status. Can be called manually: SELECT * FROM sync_all_alfietv_channels();';
COMMENT ON FUNCTION sync_all_alfietv_channels_cron IS 'Cron-friendly version of sync function for automated daily runs at 2 AM UTC';