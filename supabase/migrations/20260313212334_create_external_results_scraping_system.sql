/*
  # External Results Scraping System

  ## Summary
  Creates a complete system for scraping race results from external websites (e.g. radiosailing.org.au)
  and displaying them inside AlfiePRO alongside native results. Super admins configure sources,
  the scraper discovers and parses HTML results tables, and all users see them under
  "National Events" or "World Events" sections in the Results page.

  ## New Tables

  ### `external_result_sources`
  Configuration for each external results feed:
  - `id` - UUID primary key
  - `name` - Friendly name (e.g. "ARYA Results")
  - `url` - The URL to scrape (can be a list page or a single event page)
  - `source_type` - 'event_list' (page with links to multiple events) or 'single_event' (direct table)
  - `display_category` - 'national' or 'world' (controls which section in ResultsPage)
  - `target_national_association_id` - Optional link to a national association for context
  - `is_active` - Whether this source is actively scraped
  - `event_count` - Total events discovered from this source
  - `last_scraped_at` - Timestamp of last scrape
  - `created_by` - Super admin who created it

  ### `external_result_events`
  One row per discovered event from a source:
  - `id` - UUID primary key
  - `source_id` - FK to external_result_sources
  - `external_event_id` - The ID from the source URL (e.g. "21032"), for deduplication
  - `event_name` - Parsed event title
  - `event_date` - Parsed event start date
  - `event_end_date` - Parsed event end date (if available)
  - `venue` - Parsed venue/location
  - `boat_class_raw` - Raw class string from the source (e.g. "International Ten Rater")
  - `boat_class_id` - Optional FK to AlfiePRO's boat_classes table (mapped by admin or auto-detected)
  - `boat_class_mapped` - Normalised short class name (e.g. "10R") after mapping
  - `source_url` - Full URL to this specific event's results page
  - `results_json` - Parsed results data as JSONB (array of competitor rows)
  - `competitor_count` - Number of competitors
  - `race_count` - Number of races
  - `is_visible` - Admin-controlled toggle (default true)
  - `display_category` - Inherited from source but can be overridden per-event
  - `last_scraped_at` - When results were last fetched/updated

  ### `external_result_scrape_logs`
  Audit log for each scrape run (mirrors news_scrape_logs pattern):
  - `id`, `source_id`, `started_at`, `completed_at`
  - `events_found`, `events_created`, `events_updated`, `events_skipped`
  - `status` - 'running' | 'success' | 'error'
  - `error_message`

  ## Security
  - RLS enabled on all three tables
  - Super admins can read/write external_result_sources and external_result_scrape_logs
  - Super admins can manage external_result_events (toggle visibility, map classes)
  - All authenticated users can SELECT visible external_result_events (for display in Results page)
  - Anonymous users can also SELECT visible events (for public club sites)
  - Service role has full access for edge functions
*/

-- ============================================================
-- Table: external_result_sources
-- ============================================================
CREATE TABLE IF NOT EXISTS external_result_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  source_type text NOT NULL DEFAULT 'event_list' CHECK (source_type IN ('event_list', 'single_event')),
  display_category text NOT NULL DEFAULT 'national' CHECK (display_category IN ('national', 'world')),
  target_national_association_id uuid REFERENCES national_associations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  event_count integer NOT NULL DEFAULT 0,
  last_scraped_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE external_result_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can select external result sources"
  ON external_result_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can insert external result sources"
  ON external_result_sources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can update external result sources"
  ON external_result_sources FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can delete external result sources"
  ON external_result_sources FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Service role can manage external result sources"
  ON external_result_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: external_result_events
-- ============================================================
CREATE TABLE IF NOT EXISTS external_result_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES external_result_sources(id) ON DELETE CASCADE,
  external_event_id text,
  event_name text NOT NULL,
  event_date date,
  event_end_date date,
  venue text,
  boat_class_raw text,
  boat_class_id uuid REFERENCES boat_classes(id) ON DELETE SET NULL,
  boat_class_mapped text,
  source_url text NOT NULL,
  results_json jsonb,
  competitor_count integer NOT NULL DEFAULT 0,
  race_count integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  display_category text NOT NULL DEFAULT 'national' CHECK (display_category IN ('national', 'world')),
  last_scraped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, external_event_id)
);

ALTER TABLE external_result_events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view visible events
CREATE POLICY "Authenticated users can view visible external results"
  ON external_result_events FOR SELECT TO authenticated
  USING (is_visible = true);

-- Anonymous users can also view (for public sites)
CREATE POLICY "Anonymous users can view visible external results"
  ON external_result_events FOR SELECT TO anon
  USING (is_visible = true);

-- Super admins can see all (including hidden) and manage
CREATE POLICY "Super admins can select all external result events"
  ON external_result_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can update external result events"
  ON external_result_events FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can delete external result events"
  ON external_result_events FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Service role can manage external result events"
  ON external_result_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: external_result_scrape_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS external_result_scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES external_result_sources(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  events_found integer NOT NULL DEFAULT 0,
  events_created integer NOT NULL DEFAULT 0,
  events_updated integer NOT NULL DEFAULT 0,
  events_skipped integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE external_result_scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can select external result scrape logs"
  ON external_result_scrape_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Service role can manage external result scrape logs"
  ON external_result_scrape_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_external_result_sources_active ON external_result_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_external_result_events_source_id ON external_result_events(source_id);
CREATE INDEX IF NOT EXISTS idx_external_result_events_visible ON external_result_events(is_visible);
CREATE INDEX IF NOT EXISTS idx_external_result_events_category ON external_result_events(display_category);
CREATE INDEX IF NOT EXISTS idx_external_result_events_date ON external_result_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_external_result_scrape_logs_source_id ON external_result_scrape_logs(source_id);
