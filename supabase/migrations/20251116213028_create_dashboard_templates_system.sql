/*
  # Dashboard Templates System
  
  1. New Tables
    - `club_dashboard_templates`
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs)
      - `template_id` (text) - race, finance, membership, full, custom
      - `name` (text)
      - `description` (text)
      - `layouts` (jsonb) - stores lg, md, sm layouts
      - `assigned_roles` (text[]) - array of committee position names
      - `is_default` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      
  2. Security
    - Enable RLS on new table
    - Club members can view templates
    - Only admins/editors can create/update/delete templates
    
  3. Indexes
    - Index on club_id for fast lookups
    - Index on club_id + assigned_roles for role-based queries
*/

-- Create club_dashboard_templates table
CREATE TABLE IF NOT EXISTS club_dashboard_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  layouts JSONB NOT NULL DEFAULT '{"lg": [], "md": [], "sm": []}'::jsonb,
  assigned_roles TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_club_dashboard_templates_club_id 
  ON club_dashboard_templates(club_id);
CREATE INDEX IF NOT EXISTS idx_club_dashboard_templates_roles 
  ON club_dashboard_templates(club_id, assigned_roles);
CREATE INDEX IF NOT EXISTS idx_club_dashboard_templates_default 
  ON club_dashboard_templates(club_id, is_default) WHERE is_default = true;

-- Enable RLS
ALTER TABLE club_dashboard_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Club members can view dashboard templates"
  ON club_dashboard_templates FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins/editors can insert dashboard templates"
  ON club_dashboard_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admins/editors can update dashboard templates"
  ON club_dashboard_templates FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admins/editors can delete dashboard templates"
  ON club_dashboard_templates FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Function to get template for user's committee position
CREATE OR REPLACE FUNCTION get_template_for_user_role(p_club_id UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_position_names TEXT[];
  v_template_id UUID;
BEGIN
  -- Get all committee positions for this user
  SELECT ARRAY_AGG(cpd.position_name)
  INTO v_position_names
  FROM committee_positions cp
  JOIN committee_position_definitions cpd ON cp.position_definition_id = cpd.id
  WHERE cp.club_id = p_club_id
    AND cp.user_id = p_user_id;

  -- If user has no positions, return default template
  IF v_position_names IS NULL OR array_length(v_position_names, 1) IS NULL THEN
    SELECT id INTO v_template_id
    FROM club_dashboard_templates
    WHERE club_id = p_club_id AND is_default = true
    LIMIT 1;
    RETURN v_template_id;
  END IF;

  -- Find a template that matches any of the user's positions
  SELECT id INTO v_template_id
  FROM club_dashboard_templates
  WHERE club_id = p_club_id
    AND assigned_roles && v_position_names
  ORDER BY 
    CASE WHEN is_default THEN 1 ELSE 0 END DESC,
    created_at DESC
  LIMIT 1;

  -- If no match, return default
  IF v_template_id IS NULL THEN
    SELECT id INTO v_template_id
    FROM club_dashboard_templates
    WHERE club_id = p_club_id AND is_default = true
    LIMIT 1;
  END IF;

  RETURN v_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;