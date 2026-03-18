/*
  # Fix all scraper and billing cron jobs

  All scraper cron jobs have been failing due to incorrect references:
  - News scraper: referenced vault secrets with wrong names (SUPABASE_URL instead of supabase_url)
  - Classifieds scraper: used current_setting('app.settings.supabase_url') which doesn't exist
  - Events scraper: same current_setting issue
  - External results scraper: had no cron job at all
  - Platform billing: used extensions.http_post instead of net.http_post

  This migration:
  1. Drops and recreates all 4 scraper cron jobs using correct vault secret references
  2. Adds missing external results scraper cron job
  3. Fixes platform billing cron job
  4. All jobs now use vault.decrypted_secrets with correct lowercase key names
*/

-- Remove all broken scraper cron jobs
SELECT cron.unschedule('daily-news-scraping');
SELECT cron.unschedule('scrape-classifieds-every-2h');
SELECT cron.unschedule('scrape-external-events-hourly');

-- Remove broken billing cron job
SELECT cron.unschedule('generate-monthly-platform-billing');

-- 1. News scraper - runs daily at 6am UTC
SELECT cron.schedule(
  'daily-news-scraping',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/scrape-news-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('manual', false)
  );
  $$
);

-- 2. Classifieds scraper - runs every 2 hours
SELECT cron.schedule(
  'scrape-classifieds-every-2h',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/scrape-classifieds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('manual', false)
  );
  $$
);

-- 3. Events scraper - runs every hour
SELECT cron.schedule(
  'scrape-external-events-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/scrape-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('manual', false)
  );
  $$
);

-- 4. External results scraper - runs every 3 hours (NEW - was missing entirely)
SELECT cron.schedule(
  'scrape-external-results-every-3h',
  '30 */3 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/scrape-external-results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('manual', false)
  );
  $$
);

-- 5. Fix platform billing - runs 1st of each month at midnight
SELECT cron.schedule(
  'generate-monthly-platform-billing',
  '0 0 1 * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/generate-platform-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);