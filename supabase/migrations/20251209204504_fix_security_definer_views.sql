/*
  # Fix Security Definer View Issues

  1. Changes
    - Recreate `event_website_all_events` view with explicit SECURITY INVOKER
    - Recreate `cron_execution_monitoring` view with explicit SECURITY INVOKER
    - These views should use the permissions of the calling user for better security

  2. Security
    - Removes SECURITY DEFINER to prevent privilege escalation
    - Views will now properly respect RLS policies
*/

-- Recreate event_website_all_events with SECURITY INVOKER
DROP VIEW IF EXISTS event_website_all_events;

CREATE OR REPLACE VIEW event_website_all_events 
WITH (security_invoker = true)
AS
SELECT 
  ew.id as event_website_id,
  ew.event_id as primary_event_id,
  pe.event_name as primary_event_name,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ewe.event_id,
          'event_name', pe2.event_name,
          'is_primary', ewe.is_primary,
          'display_order', ewe.display_order
        ) ORDER BY ewe.display_order
      )
      FROM event_website_events ewe
      JOIN public_events pe2 ON pe2.id = ewe.event_id
      WHERE ewe.event_website_id = ew.id
    ),
    jsonb_build_array(
      jsonb_build_object(
        'id', ew.event_id,
        'event_name', pe.event_name,
        'is_primary', true,
        'display_order', 0
      )
    )
  ) as all_events,
  (
    SELECT COUNT(*)
    FROM event_website_events ewe2
    WHERE ewe2.event_website_id = ew.id
  ) as grouped_event_count
FROM event_websites ew
LEFT JOIN public_events pe ON pe.id = ew.event_id;

-- Recreate cron_execution_monitoring with SECURITY INVOKER
DROP VIEW IF EXISTS public.cron_execution_monitoring;

CREATE OR REPLACE VIEW public.cron_execution_monitoring
WITH (security_invoker = true)
AS
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
