/*
  # Event Website Templates System

  1. New Tables
    - `event_website_templates`
      - `id` (uuid, primary key)
      - `name` (text) - Template name
      - `description` (text) - Template description
      - `template_type` (text) - 'single_event' or 'multi_event'
      - `preview_image` (text) - Screenshot/preview of template
      - `created_by` (uuid, foreign key to profiles)
      - `club_id` (uuid, foreign key to clubs) - Optional, for club-specific templates
      - `state_association_id` (uuid, foreign key to state_associations) - Optional
      - `national_association_id` (uuid, foreign key to national_associations) - Optional
      - `is_public` (boolean) - Whether template is available to all users
      - `use_count` (integer) - Track how many times template has been used
      - `category` (text) - Template category (championship, regatta, series, etc.)
      - `config` (jsonb) - Template configuration (colors, settings, etc.)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `event_website_template_pages`
      - `id` (uuid, primary key)
      - `template_id` (uuid, foreign key to event_website_templates)
      - `page_slug` (text) - Page URL slug
      - `page_name` (text) - Display name
      - `page_order` (integer) - Order in navigation
      - `is_in_nav` (boolean) - Whether page appears in navigation
      - `is_home` (boolean) - Whether this is the homepage
      - `icon` (text) - Icon for navigation
      - `layout_config` (jsonb) - Complete page layout (rows, columns, widgets)
      - `created_at` (timestamptz)

    - `event_website_template_global_sections`
      - `id` (uuid, primary key)
      - `template_id` (uuid, foreign key to event_website_templates)
      - `section_type` (text) - 'header', 'footer', 'navigation'
      - `config` (jsonb) - Section configuration
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can view public templates
    - Users can view templates from their organization
    - Only template creators and admins can modify templates
*/

-- Create event_website_templates table
CREATE TABLE IF NOT EXISTS event_website_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_type text NOT NULL DEFAULT 'single_event' CHECK (template_type IN ('single_event', 'multi_event')),
  preview_image text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  is_public boolean DEFAULT false,
  use_count integer DEFAULT 0,
  category text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create event_website_template_pages table
CREATE TABLE IF NOT EXISTS event_website_template_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES event_website_templates(id) ON DELETE CASCADE,
  page_slug text NOT NULL,
  page_name text NOT NULL,
  page_order integer NOT NULL DEFAULT 0,
  is_in_nav boolean DEFAULT true,
  is_home boolean DEFAULT false,
  icon text,
  layout_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create event_website_template_global_sections table
CREATE TABLE IF NOT EXISTS event_website_template_global_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES event_website_templates(id) ON DELETE CASCADE,
  section_type text NOT NULL CHECK (section_type IN ('header', 'footer', 'navigation')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(template_id, section_type)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_event_website_templates_public 
  ON event_website_templates(is_public) WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_event_website_templates_club 
  ON event_website_templates(club_id) WHERE club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_website_templates_state 
  ON event_website_templates(state_association_id) WHERE state_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_website_templates_national 
  ON event_website_templates(national_association_id) WHERE national_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_template_pages_template 
  ON event_website_template_pages(template_id, page_order);

CREATE INDEX IF NOT EXISTS idx_template_global_sections_template 
  ON event_website_template_global_sections(template_id);

-- Enable RLS
ALTER TABLE event_website_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_template_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_template_global_sections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_website_templates

-- Users can view public templates
CREATE POLICY "Public templates are viewable by everyone"
  ON event_website_templates FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Users can view templates from their club
CREATE POLICY "Club members can view club templates"
  ON event_website_templates FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs
      WHERE user_id = auth.uid()
    )
  );

-- State admins can view state templates
CREATE POLICY "State admins can view state templates"
  ON event_website_templates FOR SELECT
  TO authenticated
  USING (
    state_association_id IN (
      SELECT sa.id
      FROM state_associations sa
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    )
  );

-- National admins can view national templates
CREATE POLICY "National admins can view national templates"
  ON event_website_templates FOR SELECT
  TO authenticated
  USING (
    national_association_id IN (
      SELECT na.id
      FROM national_associations na
      INNER JOIN state_associations sa ON sa.national_association_id = na.id
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'national_admin'
    )
  );

-- Club admins can create templates for their club
CREATE POLICY "Club admins can create templates"
  ON event_website_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    (club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    ))
    OR
    (state_association_id IN (
      SELECT sa.id
      FROM state_associations sa
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    ))
    OR
    (national_association_id IN (
      SELECT na.id
      FROM national_associations na
      INNER JOIN state_associations sa ON sa.national_association_id = na.id
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'national_admin'
    ))
  );

-- Users can update their own templates or templates from their organization
CREATE POLICY "Users can update own or org templates"
  ON event_website_templates FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    (club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'admin'
    ))
    OR
    (state_association_id IN (
      SELECT sa.id
      FROM state_associations sa
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    ))
    OR
    (national_association_id IN (
      SELECT na.id
      FROM national_associations na
      INNER JOIN state_associations sa ON sa.national_association_id = na.id
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'national_admin'
    ))
  );

-- Users can delete their own templates or templates from their organization
CREATE POLICY "Users can delete own or org templates"
  ON event_website_templates FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    (club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'admin'
    ))
    OR
    (state_association_id IN (
      SELECT sa.id
      FROM state_associations sa
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    ))
    OR
    (national_association_id IN (
      SELECT na.id
      FROM national_associations na
      INNER JOIN state_associations sa ON sa.national_association_id = na.id
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'national_admin'
    ))
  );

-- RLS Policies for event_website_template_pages

-- Users can view pages for templates they can access
CREATE POLICY "Users can view template pages"
  ON event_website_template_pages FOR SELECT
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM event_website_templates
    )
  );

-- Users can manage pages for templates they can manage
CREATE POLICY "Users can manage template pages"
  ON event_website_template_pages FOR ALL
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM event_website_templates
      WHERE created_by = auth.uid()
      OR club_id IN (
        SELECT uc.club_id FROM user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role = 'admin'
      )
      OR state_association_id IN (
        SELECT sa.id
        FROM state_associations sa
        INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role = 'state_admin'
      )
      OR national_association_id IN (
        SELECT na.id
        FROM national_associations na
        INNER JOIN state_associations sa ON sa.national_association_id = na.id
        INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role = 'national_admin'
      )
    )
  );

-- RLS Policies for event_website_template_global_sections

-- Users can view global sections for templates they can access
CREATE POLICY "Users can view template global sections"
  ON event_website_template_global_sections FOR SELECT
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM event_website_templates
    )
  );

-- Users can manage global sections for templates they can manage
CREATE POLICY "Users can manage template global sections"
  ON event_website_template_global_sections FOR ALL
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM event_website_templates
      WHERE created_by = auth.uid()
      OR club_id IN (
        SELECT uc.club_id FROM user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role = 'admin'
      )
      OR state_association_id IN (
        SELECT sa.id
        FROM state_associations sa
        INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role = 'state_admin'
      )
      OR national_association_id IN (
        SELECT na.id
        FROM national_associations na
        INNER JOIN state_associations sa ON sa.national_association_id = na.id
        INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role = 'national_admin'
      )
    )
  );

-- Create function to increment template use count
CREATE OR REPLACE FUNCTION increment_template_use_count(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE event_website_templates
  SET use_count = use_count + 1,
      updated_at = now()
  WHERE id = p_template_id;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE event_website_templates IS 'Stores reusable event website templates';
COMMENT ON TABLE event_website_template_pages IS 'Stores page configurations for each template';
COMMENT ON TABLE event_website_template_global_sections IS 'Stores global sections (header, footer, navigation) for templates';
COMMENT ON COLUMN event_website_templates.template_type IS 'single_event or multi_event - determines if template is for single or grouped events';
COMMENT ON COLUMN event_website_templates.is_public IS 'If true, template is available to all users; otherwise only to organization members';
COMMENT ON COLUMN event_website_templates.config IS 'Stores theme colors, default settings, and other template-wide configuration';