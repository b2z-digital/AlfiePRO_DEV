/*
  # AlfieTV Auto-Sync System

  1. Changes
    - Add `last_imported_at` column to `alfie_tv_channels` to track when each channel was last synced
    - Create a scheduled cron job that runs daily to sync all channels with auto_import enabled
    - Create a function to trigger sync for all auto-import channels

  2. Security
    - Cron job runs with elevated privileges to call edge functions
    - Only channels with auto_import=true are synced automatically
*/

-- Add last_imported_at column to track sync times
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_channels' AND column_name = 'last_imported_at'
  ) THEN
    ALTER TABLE alfie_tv_channels ADD COLUMN last_imported_at timestamptz;
  END IF;
END $$;

-- Create a function to sync all auto-import channels
CREATE OR REPLACE FUNCTION sync_all_alfietv_channels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_record RECORD;
  function_url TEXT;
  request_id BIGINT;
BEGIN
  -- Get the Supabase URL from settings
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-youtube-channel';
  
  -- Loop through all channels with auto_import enabled
  FOR channel_record IN 
    SELECT id, channel_name
    FROM alfie_tv_channels
    WHERE auto_import = true
    ORDER BY COALESCE(last_imported_at, '1970-01-01'::timestamptz) ASC
    LIMIT 10 -- Sync max 10 channels per run to avoid API rate limits
  LOOP
    BEGIN
      -- Call the sync-youtube-channel edge function using pg_net
      SELECT net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key', true)
        ),
        body := jsonb_build_object('channelId', channel_record.id)
      ) INTO request_id;
      
      -- Log successful trigger
      RAISE NOTICE 'Triggered sync for channel: % (ID: %)', channel_record.channel_name, channel_record.id;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with other channels
      RAISE WARNING 'Failed to trigger sync for channel %: %', channel_record.id, SQLERRM;
    END;
    
    -- Small delay between requests to avoid rate limiting (50ms)
    PERFORM pg_sleep(0.05);
  END LOOP;
END;
$$;

-- Comment on function
COMMENT ON FUNCTION sync_all_alfietv_channels IS 'Automatically syncs all AlfieTV channels with auto_import enabled';

-- Schedule daily sync at 2 AM UTC (pg_cron already enabled from previous migration)
SELECT cron.schedule(
  'alfietv-daily-sync',
  '0 2 * * *', -- Run at 2 AM every day
  $$SELECT sync_all_alfietv_channels()$$
);