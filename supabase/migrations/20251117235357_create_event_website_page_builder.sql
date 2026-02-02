/*
  # Event Website Page Builder System

  1. New Tables
    - `event_page_layouts`
      - Stores drag-and-drop page layouts with rows and columns
      - Includes widget configurations
    - `event_global_sections`
      - Stores header, menu, and footer configurations
      - Enables consistent branding across event website
  
  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users managing their event websites
*/

-- Event Page Layouts Table
CREATE TABLE IF NOT EXISTS event_page_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE NOT NULL,
  page_slug text NOT NULL,
  rows jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_website_id, page_slug)
);

ALTER TABLE event_page_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view event page layouts"
  ON event_page_layouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

CREATE POLICY "Users can insert event page layouts"
  ON event_page_layouts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

CREATE POLICY "Users can update event page layouts"
  ON event_page_layouts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

CREATE POLICY "Users can delete event page layouts"
  ON event_page_layouts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

-- Event Global Sections Table
CREATE TABLE IF NOT EXISTS event_global_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE NOT NULL,
  section_type text NOT NULL CHECK (section_type IN ('header', 'menu', 'footer')),
  enabled boolean DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_website_id, section_type)
);

ALTER TABLE event_global_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view event global sections"
  ON event_global_sections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

CREATE POLICY "Users can insert event global sections"
  ON event_global_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

CREATE POLICY "Users can update event global sections"
  ON event_global_sections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

CREATE POLICY "Users can delete event global sections"
  ON event_global_sections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_website_id
      AND (
        pe.club_id = (SELECT club_id FROM user_clubs WHERE user_id = auth.uid() LIMIT 1)
        OR auth.uid() IN (
          SELECT user_id FROM user_clubs uc
          JOIN clubs c ON c.id = uc.club_id
          WHERE c.state_association_id = pe.state_association_id
          AND uc.role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_page_layouts_website_id ON event_page_layouts(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_page_layouts_page_slug ON event_page_layouts(page_slug);
CREATE INDEX IF NOT EXISTS idx_event_global_sections_website_id ON event_global_sections(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_global_sections_section_type ON event_global_sections(section_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_event_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS event_page_layouts_updated_at ON event_page_layouts;
CREATE TRIGGER event_page_layouts_updated_at
  BEFORE UPDATE ON event_page_layouts
  FOR EACH ROW
  EXECUTE FUNCTION update_event_layouts_updated_at();

DROP TRIGGER IF EXISTS event_global_sections_updated_at ON event_global_sections;
CREATE TRIGGER event_global_sections_updated_at
  BEFORE UPDATE ON event_global_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_event_layouts_updated_at();