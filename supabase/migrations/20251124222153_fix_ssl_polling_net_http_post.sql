/*
  # Fix SSL Polling to Use net.http_post Correctly
  
  1. Changes
    - Use correct net.http_post syntax for Supabase
    - Remove schema qualification that causes cross-database reference error
  
  2. Testing
    - Call trigger_ssl_check() to test manually
    - Verify request is sent to edge function
*/

-- Update the polling function with correct net.http_post usage
CREATE OR REPLACE FUNCTION public.poll_amplify_ssl_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text := 'https://ehgbpdqbsykhepuwdgrj.supabase.co';
  v_service_key text;
  v_request_id bigint;
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
  
  -- Make HTTP request to check SSL status
  SELECT net.http_post(
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
      'detail', SQLSTATE,
      'timestamp', now()
    );
END;
$$;
