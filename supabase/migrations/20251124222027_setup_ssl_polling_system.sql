/*
  # Setup SSL Polling System
  
  1. Overview
    - Creates infrastructure for automated SSL status checking
    - Stores configuration securely in database
    - Provides manual trigger function for testing
  
  2. Components
    - Configuration table for storing service credentials
    - Polling function to check SSL status
    - Manual trigger function for testing
    - Monitoring view for cron job status
  
  3. Usage
    - Cron job configured separately via Supabase dashboard
    - Run trigger_ssl_check() to test manually
    - View cron_job_monitoring for status
*/

-- Create a config table to store the service role key securely
CREATE TABLE IF NOT EXISTS public.cron_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  encrypted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on cron_config
ALTER TABLE public.cron_config ENABLE ROW LEVEL SECURITY;

-- Only service role can access cron config
DROP POLICY IF EXISTS "Only service role can access cron config" ON public.cron_config;
CREATE POLICY "Only service role can access cron config"
  ON public.cron_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create a stored procedure that will be called by cron
CREATE OR REPLACE FUNCTION public.poll_amplify_ssl_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      'timestamp', now()
    );
END;
$$;

-- Create a public function for manual triggering (for testing)
CREATE OR REPLACE FUNCTION public.trigger_ssl_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.poll_amplify_ssl_status();
END;
$$;

-- Grant execute permission to authenticated users for manual trigger
GRANT EXECUTE ON FUNCTION public.trigger_ssl_check() TO authenticated;

-- Create a table to log cron executions
CREATE TABLE IF NOT EXISTS public.cron_execution_log (
  id bigserial PRIMARY KEY,
  job_name text NOT NULL,
  executed_at timestamptz DEFAULT now(),
  success boolean,
  result jsonb,
  error_message text
);

-- Enable RLS on execution log
ALTER TABLE public.cron_execution_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view logs
DROP POLICY IF EXISTS "Authenticated users can view cron logs" ON public.cron_execution_log;
CREATE POLICY "Authenticated users can view cron logs"
  ON public.cron_execution_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role can insert logs
DROP POLICY IF EXISTS "Service role can insert cron logs" ON public.cron_execution_log;
CREATE POLICY "Service role can insert cron logs"
  ON public.cron_execution_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create a function that logs execution and polls
CREATE OR REPLACE FUNCTION public.poll_amplify_ssl_with_logging()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Execute the polling function
  v_result := public.poll_amplify_ssl_status();
  
  -- Log the execution
  INSERT INTO public.cron_execution_log (job_name, success, result)
  VALUES (
    'check-amplify-ssl-status',
    (v_result->>'success')::boolean,
    v_result
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    INSERT INTO public.cron_execution_log (job_name, success, error_message)
    VALUES (
      'check-amplify-ssl-status',
      false,
      SQLERRM
    );
END;
$$;

-- Create a view to monitor recent cron executions
CREATE OR REPLACE VIEW public.cron_execution_monitoring AS
SELECT 
  id,
  job_name,
  executed_at,
  success,
  result,
  error_message,
  age(now(), executed_at) as time_since_execution
FROM public.cron_execution_log
ORDER BY executed_at DESC
LIMIT 100;

-- Grant access to monitoring view
GRANT SELECT ON public.cron_execution_monitoring TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.poll_amplify_ssl_status() IS 
  'Polls AWS Amplify for SSL status updates on pending domains';
  
COMMENT ON FUNCTION public.trigger_ssl_check() IS 
  'Manual trigger for SSL status checking - useful for testing';

COMMENT ON FUNCTION public.poll_amplify_ssl_with_logging() IS
  'Polling function with execution logging for cron job monitoring';

COMMENT ON TABLE public.cron_config IS 
  'Secure storage for cron job configuration including API keys';

COMMENT ON TABLE public.cron_execution_log IS
  'Log of all cron job executions for monitoring and debugging';

COMMENT ON VIEW public.cron_execution_monitoring IS 
  'Recent cron job executions with timing information';
