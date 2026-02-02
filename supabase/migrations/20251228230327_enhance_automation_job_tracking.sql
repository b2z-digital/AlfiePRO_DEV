/*
  # Enhance Automation Job Tracking
  
  1. Schema Updates
    - Add missing columns to marketing_automation_job_runs table
    - enrollments_processed: Track number of enrollments processed
    - execution_time_ms: Track execution time
    - error_details: JSON field for detailed error information
  
  2. Functions
    - trigger_automation_flows_internal: Manual trigger function for testing
  
  3. Views
    - automation_job_status: Monitor automation run history
  
  4. Scheduling Setup
    The process-automation-flows edge function is deployed and ready.
    Set up scheduling using Supabase Dashboard or external cron service.
*/

-- Add missing columns to tracking table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_automation_job_runs' 
    AND column_name = 'enrollments_processed'
  ) THEN
    ALTER TABLE public.marketing_automation_job_runs 
    ADD COLUMN enrollments_processed integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_automation_job_runs' 
    AND column_name = 'execution_time_ms'
  ) THEN
    ALTER TABLE public.marketing_automation_job_runs 
    ADD COLUMN execution_time_ms integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_automation_job_runs' 
    AND column_name = 'error_details'
  ) THEN
    ALTER TABLE public.marketing_automation_job_runs 
    ADD COLUMN error_details jsonb;
  END IF;
END $$;

-- Create internal trigger function for manual execution
CREATE OR REPLACE FUNCTION public.trigger_automation_flows_internal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_id uuid;
  start_time timestamptz;
BEGIN
  start_time := now();
  
  -- Create job run record
  INSERT INTO public.marketing_automation_job_runs (status, started_at)
  VALUES ('triggered', start_time)
  RETURNING id INTO job_id;
  
  -- Log that automation flow check was triggered
  RAISE NOTICE 'Automation flow processing triggered at %. Job ID: %', start_time, job_id;
  
  -- Update with completion time
  UPDATE public.marketing_automation_job_runs
  SET 
    completed_at = now(),
    execution_time_ms = EXTRACT(EPOCH FROM (now() - start_time)) * 1000
  WHERE id = job_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'job_id', job_id,
    'triggered_at', start_time,
    'message', 'Automation flow processing triggered. The process-automation-flows edge function will process active flows on its next scheduled run.'
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.trigger_automation_flows_internal() TO authenticated;

-- Create a view for monitoring automation runs
CREATE OR REPLACE VIEW public.automation_job_status AS
SELECT 
  id,
  started_at,
  completed_at,
  status,
  flows_processed,
  enrollments_processed,
  emails_sent,
  errors as errors_count,
  error_message,
  error_details,
  execution_time_ms,
  CASE 
    WHEN completed_at IS NULL THEN 'In Progress'
    WHEN status = 'triggered' THEN 'Triggered'
    WHEN errors > 0 THEN 'Completed with Errors'
    WHEN status = 'completed' THEN 'Success'
    ELSE status
  END as run_status,
  (completed_at - started_at) as duration
FROM public.marketing_automation_job_runs
ORDER BY started_at DESC
LIMIT 100;

-- Grant access to view
GRANT SELECT ON public.automation_job_status TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.trigger_automation_flows_internal() IS 
'Triggers automation flow processing log entry. For testing purposes only. 
The actual processing happens in the process-automation-flows edge function which should be scheduled to run every 5 minutes.';

COMMENT ON VIEW public.automation_job_status IS
'Monitor automation flow processing history and status. 
Shows the last 100 runs with status, metrics, and error information.';
