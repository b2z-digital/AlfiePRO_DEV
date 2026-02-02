/*
  # Fix SSL Polling Functions to Use Correct pg_net Schema
  
  1. Changes
    - Update poll_amplify_ssl_status to reference extensions.net
    - Ensure proper schema qualification for pg_net calls
  
  2. Testing
    - Call trigger_ssl_check() to test manually
    - Monitor cron_execution_log for automated runs
*/

-- Update the polling function with correct schema reference
CREATE OR REPLACE FUNCTION public.poll_amplify_ssl_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url text := 'https://ehgbpdqbsykhepuwdgrj.supabase.co';
  v_service_key text;
  v_request_id bigint;
  v_result jsonb;
BEGIN
  -- Get the service role key from config table
  SELECT value INTO v_service_key
  FROM public.cron_config
  WHERE key = 'supabase_service_role_key'
  LIMIT 1;
  
  IF v_service_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Service role key not configured in cron_config table',
      'timestamp', now()
    );
  END IF;
  
  -- Make HTTP request to check SSL status using extensions.net
  SELECT extensions.net.http_post(
    url := v_supabase_url || '/functions/v1/check-amplify-ssl-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'SSL status check triggered',
    'request_id', v_request_id,
    'timestamp', now()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'timestamp', now()
    );
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.poll_amplify_ssl_status() IS 
  'Polls AWS Amplify for SSL status updates on pending domains using pg_net HTTP requests';
