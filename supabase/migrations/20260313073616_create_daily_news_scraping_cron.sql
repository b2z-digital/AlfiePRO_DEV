/*
  # Daily News Scraping Cron Job
  Schedules the scrape-news-sources edge function to run every day at 6am UTC.
*/
SELECT cron.schedule(
  'daily-news-scraping',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/scrape-news-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY')
    ),
    body := jsonb_build_object('manual', false)
  );
  $$
);
