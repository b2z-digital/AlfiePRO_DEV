/*
  # Create Classifieds Scraping System

  1. Modified Tables
    - `classifieds`
      - `source_url` (text, nullable) - URL of the original external listing
      - `external_source_id` (text, nullable) - Unique ID from the scrape source for deduplication
      - `is_scraped` (boolean, default false) - Whether this was auto-scraped

  2. New Tables
    - `classified_scrape_sources`
      - `id` (uuid, primary key)
      - `name` (text) - Display name of the source
      - `url` (text) - URL to scrape for listings
      - `is_active` (boolean, default true)
      - `last_scraped_at` (timestamptz, nullable)
      - `listing_count` (integer, default 0)
      - `created_at` / `updated_at` (timestamptz)
    - `classified_scrape_logs`
      - `id` (uuid, primary key)
      - `source_id` (uuid, FK)
      - `status` (text) - running/success/error
      - `listings_found` / `listings_created` / `listings_updated` / `listings_removed` (integer)
      - `error_message` (text, nullable)
      - `started_at` / `completed_at` (timestamptz)

  3. Security
    - RLS enabled on both new tables
    - Only super admins can manage scrape sources and view logs

  4. Cron Job
    - Runs every 2 hours to scrape classifieds
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'source_url'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN source_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'external_source_id'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN external_source_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'is_scraped'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN is_scraped boolean DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classifieds_external_source_id
  ON classifieds (external_source_id) WHERE external_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classifieds_is_scraped
  ON classifieds (is_scraped) WHERE is_scraped = true;

CREATE TABLE IF NOT EXISTS classified_scrape_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  last_scraped_at timestamptz,
  listing_count integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE classified_scrape_sources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'classified_scrape_sources' AND policyname = 'Super admins can manage classified scrape sources'
  ) THEN
    CREATE POLICY "Super admins can manage classified scrape sources"
      ON classified_scrape_sources
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid() AND uc.role = 'super_admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid() AND uc.role = 'super_admin'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS classified_scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES classified_scrape_sources(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  listings_found integer DEFAULT 0 NOT NULL,
  listings_created integer DEFAULT 0 NOT NULL,
  listings_updated integer DEFAULT 0 NOT NULL,
  listings_removed integer DEFAULT 0 NOT NULL,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE classified_scrape_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'classified_scrape_logs' AND policyname = 'Super admins can view classified scrape logs'
  ) THEN
    CREATE POLICY "Super admins can view classified scrape logs"
      ON classified_scrape_logs
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid() AND uc.role = 'super_admin'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classified_scrape_logs_source_id
  ON classified_scrape_logs (source_id);

INSERT INTO classified_scrape_sources (name, url, is_active)
VALUES ('ARYA Classifieds', 'https://radiosailing.org.au/index.php?arcade=classifieds', true)
ON CONFLICT DO NOTHING;
