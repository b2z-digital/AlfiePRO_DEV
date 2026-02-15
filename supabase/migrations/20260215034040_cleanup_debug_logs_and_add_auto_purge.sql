/*
  # Clean up debug log tables and add automatic purging

  1. Changes
    - Truncates `trigger_debug_log` table (92,747 old debug rows, ~30MB)
    - Truncates `cron_execution_log` table (23,306 old log rows, ~6MB)
    - Creates a function to purge old log entries (keeps last 7 days)
    - Schedules a daily pg_cron job to run the purge at 3:00 AM UTC

  2. Notes
    - Both tables contain only debug/operational logs safe to remove
    - The automatic purge ensures these tables never accumulate excessively again
    - 7-day retention provides enough history for debugging while keeping storage lean
*/

TRUNCATE TABLE public.trigger_debug_log;
TRUNCATE TABLE public.cron_execution_log;

CREATE OR REPLACE FUNCTION public.purge_old_debug_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.trigger_debug_log
  WHERE created_at < NOW() - INTERVAL '7 days';

  DELETE FROM public.cron_execution_log
  WHERE executed_at < NOW() - INTERVAL '7 days';
END;
$$;

SELECT cron.unschedule('purge-old-debug-logs')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'purge-old-debug-logs'
);

SELECT cron.schedule(
  'purge-old-debug-logs',
  '0 3 * * *',
  $$SELECT public.purge_old_debug_logs()$$
);
