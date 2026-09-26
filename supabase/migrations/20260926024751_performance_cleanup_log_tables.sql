/*
# Performance: Clean up bloated log tables (181 MB -> ~20 MB)

notifications: 91 MB, email_logs: 90 MB, platform_page_views: 15 MB
Together these are 55% of the database. Trimming to 90 days keeps useful
data while freeing massive disk IO and memory pressure.
*/

DELETE FROM notifications WHERE created_at < now() - interval '90 days';
DELETE FROM email_logs WHERE created_at < now() - interval '90 days';
DELETE FROM platform_page_views WHERE viewed_at < now() - interval '90 days';
DELETE FROM trigger_debug_log WHERE created_at < now() - interval '7 days';

SELECT cron.schedule(
  'cleanup-old-notifications',
  '30 0 * * *',
  $$DELETE FROM notifications WHERE created_at < now() - interval '90 days'$$
);

SELECT cron.schedule(
  'cleanup-old-email-logs',
  '45 0 * * *',
  $$DELETE FROM email_logs WHERE created_at < now() - interval '90 days'$$
);

SELECT cron.schedule(
  'cleanup-old-page-views',
  '15 0 * * *',
  $$DELETE FROM platform_page_views WHERE viewed_at < now() - interval '90 days'$$
);

SELECT cron.schedule(
  'cleanup-debug-logs',
  '0 1 * * *',
  $$DELETE FROM trigger_debug_log WHERE created_at < now() - interval '7 days'$$
);
