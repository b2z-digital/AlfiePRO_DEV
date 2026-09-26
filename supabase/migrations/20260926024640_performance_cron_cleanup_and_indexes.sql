/*
# Performance: Auto-clean cron logs and add missing indexes

## Problem
1. cron.job_run_details had 97,647 rows (21 MB), making every cron insert 
   take 4.7 seconds average - the #1 cause of periodic DB crashes.
2. Several frequently queried tables lack optimal indexes.

## Fix
1. Auto-purge cron logs older than 3 days (runs daily at midnight)
2. Add targeted indexes on the most expensive query paths
*/

SELECT cron.schedule(
  'cleanup-cron-job-history',
  '0 0 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '3 days'$$
);

CREATE INDEX IF NOT EXISTS idx_venues_name ON venues (name);
CREATE INDEX IF NOT EXISTS idx_public_events_club_date ON public_events (club_id, date);
CREATE INDEX IF NOT EXISTS idx_race_series_club_created ON race_series (club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_races_club_id ON quick_races (club_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON event_registrations (event_id);
