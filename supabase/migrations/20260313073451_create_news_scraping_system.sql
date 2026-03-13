/*
  # News Scraping System

  ## Summary
  Creates a complete news scraping system that allows super admins to configure
  external news sources (URLs) that get scraped daily for new articles, which
  are then stored against a chosen association (state, national, or all states).

  ## New Tables

  ### `news_scrape_sources`
  Stores configuration for each external news source:
  - `id` - UUID primary key
  - `name` - Friendly name for the source (e.g. "Radio Sailing Australia")
  - `url` - The URL to scrape
  - `target_type` - Where to store scraped articles: 'state', 'national', 'all_states'
  - `target_national_association_id` - If target is 'national' or 'all_states'
  - `target_state_association_id` - If target is a specific 'state'
  - `is_active` - Whether this source is actively scraped
  - `scrape_selector` - Optional CSS selector hint for article links (default tries common patterns)
  - `last_scraped_at` - Timestamp of last successful scrape
  - `article_count` - Total articles scraped from this source
  - `created_by` - The super admin who created it
  - `created_at`, `updated_at`

  ### `news_scrape_logs`
  Tracks each scrape run:
  - `id`, `source_id`, `started_at`, `completed_at`
  - `articles_found`, `articles_created`, `articles_skipped`
  - `status` - 'running' | 'success' | 'error'
  - `error_message`

  ## Security
  - RLS enabled on both tables
  - Only super admins can read/write news_scrape_sources
  - Only super admins can read news_scrape_logs
*/

CREATE TABLE IF NOT EXISTS news_scrape_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  target_type text NOT NULL DEFAULT 'national' CHECK (target_type IN ('state', 'national', 'all_states')),
  target_national_association_id uuid REFERENCES national_associations(id) ON DELETE SET NULL,
  target_state_association_id uuid REFERENCES state_associations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  scrape_selector text,
  last_scraped_at timestamptz,
  article_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE news_scrape_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can select news scrape sources"
  ON news_scrape_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can insert news scrape sources"
  ON news_scrape_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update news scrape sources"
  ON news_scrape_sources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can delete news scrape sources"
  ON news_scrape_sources FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Edge function / service role needs to read sources and update them
CREATE POLICY "Service role can manage news scrape sources"
  ON news_scrape_sources FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Scrape logs table
CREATE TABLE IF NOT EXISTS news_scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES news_scrape_sources(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  articles_found integer NOT NULL DEFAULT 0,
  articles_created integer NOT NULL DEFAULT 0,
  articles_skipped integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE news_scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can select news scrape logs"
  ON news_scrape_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Service role can manage news scrape logs"
  ON news_scrape_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add scraped_url column to articles to track origin and avoid duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'scraped_url'
  ) THEN
    ALTER TABLE articles ADD COLUMN scraped_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'is_scraped'
  ) THEN
    ALTER TABLE articles ADD COLUMN is_scraped boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_news_scrape_sources_active ON news_scrape_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_news_scrape_logs_source_id ON news_scrape_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_articles_scraped_url ON articles(scraped_url) WHERE scraped_url IS NOT NULL;
