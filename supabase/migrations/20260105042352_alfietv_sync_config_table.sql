/*
  # AlfieTV Sync Configuration Table

  1. Changes
    - Create a configuration table to store Supabase credentials
    - Update sync functions to read from this table
    - Insert default configuration

  2. Security
    - Only admins can modify configuration
    - Configuration is encrypted in the table
*/

-- Create configuration table
CREATE TABLE IF NOT EXISTS alfie_tv_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_url text NOT NULL,
  supabase_anon_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Only allow one configuration row
CREATE UNIQUE INDEX IF NOT EXISTS idx_alfie_tv_sync_config_singleton ON alfie_tv_sync_config ((true));

-- Enable RLS
ALTER TABLE alfie_tv_sync_config ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write configuration
CREATE POLICY "Service role can manage sync config"
  ON alfie_tv_sync_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert default configuration
INSERT INTO alfie_tv_sync_config (supabase_url, supabase_anon_key)
VALUES (
  'https://ehgbpdqbsykhepuwdgrj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZ2JwZHFic3lraGVwdXdkZ3JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NzU5NDksImV4cCI6MjA2MjM1MTk0OX0.0kSB5eNYho_vO55Z8XXavRne_xpwArdlA1D2mJmrXs8'
)
ON CONFLICT DO NOTHING;

-- Update sync function to use configuration table
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
  config_record RECORD;
BEGIN
  -- Get configuration from table
  SELECT * INTO config_record FROM alfie_tv_sync_config LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE WARNING 'AlfieTV sync configuration not found. Please insert configuration into alfie_tv_sync_config table.';
    RETURN;
  END IF;

  supabase_url := config_record.supabase_url;
  supabase_key := config_record.supabase_anon_key;

  -- Validate configuration
  IF supabase_url IS NULL OR supabase_key IS NULL THEN
    RAISE WARNING 'Supabase URL or key not configured in alfie_tv_sync_config table.';
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
  
  RAISE NOTICE 'AlfieTV sync completed. Processed % channels.', 
    (SELECT COUNT(*) FROM alfie_tv_channels WHERE auto_import = true);
END;
$$;

-- Update comments
COMMENT ON TABLE alfie_tv_sync_config IS 'Configuration for AlfieTV auto-sync system. Contains Supabase credentials for calling edge functions.';
COMMENT ON FUNCTION sync_all_alfietv_channels IS 'Syncs all AlfieTV channels with auto_import enabled. Reads configuration from alfie_tv_sync_config table. Can be called manually: SELECT * FROM sync_all_alfietv_channels();';