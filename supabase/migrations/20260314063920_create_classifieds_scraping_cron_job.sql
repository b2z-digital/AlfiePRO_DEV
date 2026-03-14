/*
  # Create Classifieds Scraping Cron Job

  Schedules automatic classifieds scraping every 2 hours using pg_cron.
  Calls the scrape-classifieds edge function via net.http_post.
*/

SELECT cron.schedule(
  'scrape-classifieds-every-2h',
  '0 */2 * * *',
  E'SELECT net.http_post(\n  url := current_setting(\'app.settings.supabase_url\') || \'/functions/v1/scrape-classifieds\',\n  headers := jsonb_build_object(\n    \'Content-Type\', \'application/json\',\n    \'Authorization\', \'Bearer \' || current_setting(\'app.settings.service_role_key\')\n  ),\n  body := \'{}\'::jsonb\n);'
);
