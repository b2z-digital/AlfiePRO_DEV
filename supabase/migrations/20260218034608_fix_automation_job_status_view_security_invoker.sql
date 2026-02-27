/*
  # Fix automation_job_status view security

  1. Changes
    - Recreates the `automation_job_status` view with `security_invoker = true`
    - This ensures the view respects RLS policies of the querying user
      instead of using the view creator's permissions (SECURITY DEFINER)

  2. Security
    - Resolves Supabase Security Advisor error about SECURITY DEFINER views
    - The underlying `marketing_automation_job_runs` table has RLS enabled,
      so the view should respect those policies
*/

CREATE OR REPLACE VIEW public.automation_job_status
WITH (security_invoker = true)
AS
SELECT 
  id,
  started_at,
  completed_at,
  status,
  flows_processed,
  enrollments_processed,
  emails_sent,
  errors AS errors_count,
  error_message,
  error_details,
  execution_time_ms,
  CASE
    WHEN completed_at IS NULL THEN 'In Progress'
    WHEN status = 'triggered' THEN 'Triggered'
    WHEN errors > 0 THEN 'Completed with Errors'
    WHEN status = 'completed' THEN 'Success'
    ELSE status
  END AS run_status,
  completed_at - started_at AS duration
FROM public.marketing_automation_job_runs
ORDER BY started_at DESC
LIMIT 100;

GRANT SELECT ON public.automation_job_status TO authenticated;