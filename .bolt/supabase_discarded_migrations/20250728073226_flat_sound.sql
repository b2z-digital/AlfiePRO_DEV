/*
  # Create document templates table

  1. New Tables
    - `document_templates`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `name` (text, template name)
      - `description` (text, optional description)
      - `logo_url` (text, optional logo URL)
      - `sections` (jsonb, array of document sections)
      - `is_active` (boolean, for soft delete)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `document_templates` table
    - Add policies for club admins/editors to manage templates
    - Add policies for club members to view templates
    - Add policies for super admins to manage all templates

  3. Performance
    - Add index on club_id for faster queries
    - Add trigger for auto-updating updated_at timestamp
*/

-- Create document_templates table
CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  logo_url text,
  sections jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_document_templates_club_id ON document_templates(club_id);

-- Create policies
CREATE POLICY "Club admins and editors can manage document templates"
  ON document_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = uid()
      AND uc.role = ANY(ARRAY['admin'::club_role, 'editor'::club_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = uid()
      AND uc.role = ANY(ARRAY['admin'::club_role, 'editor'::club_role])
    )
  );

CREATE POLICY "Club members can view document templates"
  ON document_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = uid()
    )
  );

CREATE POLICY "Super admins can manage all document templates"
  ON document_templates
  FOR ALL
  TO authenticated
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_document_templates_updated_at();