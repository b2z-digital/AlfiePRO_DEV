/*
  # External Events Scraping System

  ## Summary
  Creates a complete system for scraping upcoming events from external websites (e.g. radiosailing.org.au)
  and displaying them in AlfiePRO's Race Calendar under State/National Events sections.
  Super admins configure sources via the platform dashboard, an edge function scrapes event listings
  and detail pages, and all users see upcoming external events in the Race Calendar.

  ## New Tables

  ### `external_event_sources`
  Configuration for each external events feed:
  - `id` - UUID primary key
  - `name` - Friendly name (e.g. "ARYA Events")
  - `url` - The URL to scrape (event list page)
  - `source_type` - 'event_list' (page with table of events)
  - `display_category` - 'national', 'state', or 'state_<uuid>' for specific state associations
  - `target_national_association_id` - Optional FK to national_associations
  - `is_active` - Whether this source is actively scraped
  - `event_count` - Total events discovered from this source
  - `last_scraped_at` - Timestamp of last scrape
  - `created_by` - Super admin who created it

  ### `external_events`
  One row per discovered upcoming event:
  - `id` - UUID primary key
  - `source_id` - FK to external_event_sources
  - `external_event_id` - The event ID from the source URL for deduplication
  - `event_name` - Parsed event title
  - `event_date` - Parsed event date
  - `event_end_date` - Parsed event end date (for multi-day events)
  - `venue` - Full venue (e.g. "Wallaroo Sailing Club")
  - `location` - City/state (e.g. "Wallaroo, SA, AUS")
  - `state_code` - Australian state code (NSW, VIC, QLD, SA, WA, TAS, NT, ACT)
  - `country_code` - Country code (e.g. "AUS")
  - `boat_class_raw` - Raw class string from the source
  - `boat_class_mapped` - Normalised short class name (e.g. "DF65")
  - `boat_class_id` - Optional FK to boat_classes table
  - `event_type` - 'national', 'state', 'invitational', 'club', 'world'
  - `event_status` - 'active', 'cancelled', 'postponed'
  - `ranking_event` - Whether it's a ranking event
  - `source_url` - Full URL to event detail page
  - `documents_json` - JSONB array of {name, url} for attached documents
  - `registration_url` - External registration link if available
  - `is_visible` - Admin-controlled visibility toggle
  - `display_category` - Category for display filtering

  ### `external_event_scrape_logs`
  Audit log for each scrape run

  ## Security
  - RLS enabled on all three tables
  - Super admins have full CRUD
  - Authenticated and anonymous users can view visible events
  - Service role has full access for edge functions

  ## Cron Job
  - Hourly scrape via pg_cron
*/

-- ============================================================
-- Table: external_event_sources
-- ============================================================
CREATE TABLE IF NOT EXISTS external_event_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  source_type text NOT NULL DEFAULT 'event_list' CHECK (source_type IN ('event_list', 'single_event')),
  display_category text NOT NULL DEFAULT 'national',
  target_national_association_id uuid REFERENCES national_associations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  event_count integer NOT NULL DEFAULT 0,
  last_scraped_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE external_event_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can select external event sources"
  ON external_event_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can insert external event sources"
  ON external_event_sources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can update external event sources"
  ON external_event_sources FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can delete external event sources"
  ON external_event_sources FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Service role can manage external event sources"
  ON external_event_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: external_events
-- ============================================================
CREATE TABLE IF NOT EXISTS external_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES external_event_sources(id) ON DELETE CASCADE,
  external_event_id text,
  event_name text NOT NULL,
  event_date date,
  event_end_date date,
  venue text,
  location text,
  state_code text,
  country_code text DEFAULT 'AUS',
  boat_class_raw text,
  boat_class_mapped text,
  boat_class_id uuid REFERENCES boat_classes(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT 'state' CHECK (event_type IN ('national', 'state', 'invitational', 'club', 'world')),
  event_status text NOT NULL DEFAULT 'active' CHECK (event_status IN ('active', 'cancelled', 'postponed')),
  ranking_event boolean NOT NULL DEFAULT false,
  source_url text NOT NULL,
  documents_json jsonb DEFAULT '[]'::jsonb,
  registration_url text,
  is_visible boolean NOT NULL DEFAULT true,
  display_category text NOT NULL DEFAULT 'national',
  last_scraped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, external_event_id)
);

ALTER TABLE external_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view visible external events"
  ON external_events FOR SELECT TO authenticated
  USING (is_visible = true);

CREATE POLICY "Anonymous users can view visible external events"
  ON external_events FOR SELECT TO anon
  USING (is_visible = true);

CREATE POLICY "Super admins can select all external events"
  ON external_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can update external events"
  ON external_events FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Super admins can delete external events"
  ON external_events FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Service role can manage external events"
  ON external_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Table: external_event_scrape_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS external_event_scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES external_event_sources(id) ON DELETE CASCADE,
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

ALTER TABLE external_event_scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can select external event scrape logs"
  ON external_event_scrape_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true));

CREATE POLICY "Service role can manage external event scrape logs"
  ON external_event_scrape_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_external_event_sources_active ON external_event_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_external_events_source_id ON external_events(source_id);
CREATE INDEX IF NOT EXISTS idx_external_events_visible ON external_events(is_visible);
CREATE INDEX IF NOT EXISTS idx_external_events_category ON external_events(display_category);
CREATE INDEX IF NOT EXISTS idx_external_events_date ON external_events(event_date ASC);
CREATE INDEX IF NOT EXISTS idx_external_events_state ON external_events(state_code);
CREATE INDEX IF NOT EXISTS idx_external_events_status ON external_events(event_status);
CREATE INDEX IF NOT EXISTS idx_external_event_scrape_logs_source_id ON external_event_scrape_logs(source_id);

-- ============================================================
-- Hourly cron job to scrape events
-- ============================================================
SELECT cron.schedule(
  'scrape-external-events-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/scrape-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
