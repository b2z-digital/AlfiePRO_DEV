/*
  # Create SSL Polling Cron Job
  
  1. Setup
    - Enable pg_cron extension if not already enabled
    - Create cron job to poll AWS Amplify SSL status every 5 minutes
    - Job checks pending domains and updates their status automatically
  
  2. Functionality
    - Runs every 5 minutes
    - Calls check-amplify-ssl-status edge function
    - Updates domain and SSL status when certificates are ready
    - Provides automated monitoring without manual intervention
  
  3. Security
    - Uses service role key for authentication
    - Runs with secure database context
    - Handles errors gracefully
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Create the cron job to check SSL status every 5 minutes
-- This will automatically poll AWS Amplify and update domain statuses
SELECT cron.schedule(
  'check-amplify-ssl-status',          -- Job name
  '*/5 * * * *',                        -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url:=current_setting('app.settings.supabase_url') || '/functions/v1/check-amplify-ssl-status',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body:=jsonb_build_object()
    ) as request_id;
  $$
);

-- Store Supabase URL and service role key in database settings
-- These are used by the cron job to authenticate
DO $$
BEGIN
  -- Set the Supabase URL
  EXECUTE format('ALTER DATABASE %I SET app.settings.supabase_url = %L', 
    current_database(), 
    current_setting('SUPABASE_URL', true)
  );
  
  -- Set the service role key
  EXECUTE format('ALTER DATABASE %I SET app.settings.supabase_service_role_key = %L',
    current_database(),
    current_setting('SUPABASE_SERVICE_ROLE_KEY', true)
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Settings will need to be configured manually if this fails
    RAISE NOTICE 'Could not set database settings automatically. Please configure manually.';
END $$;

-- Grant necessary permissions for the cron job
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create a helper function to manually trigger the SSL check (useful for testing)
CREATE OR REPLACE FUNCTION public.trigger_ssl_status_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT
    net.http_post(
      url:=current_setting('app.settings.supabase_url') || '/functions/v1/check-amplify-ssl-status',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body:=jsonb_build_object()
    ) INTO result;
    
  RETURN result;
END;
$$;

-- Add comment explaining the cron job
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - Used for SSL status polling';
