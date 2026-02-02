/*
  # Create Email Templates System

  1. New Tables
    - `marketing_email_templates`
      - `id` (uuid, primary key)
      - `club_id` (uuid, nullable) - Club that created the template
      - `state_association_id` (uuid, nullable) - State association
      - `national_association_id` (uuid, nullable) - National association
      - `name` (text) - Template name
      - `description` (text, nullable) - Template description
      - `thumbnail_url` (text, nullable) - Preview image
      - `category` (text) - Template category (event, newsletter, announcement, etc.)
      - `email_content_json` (jsonb) - Email builder structure
      - `email_content_html` (text) - Rendered HTML
      - `is_public` (boolean) - Available to all clubs
      - `created_by` (uuid, nullable) - User who created it
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `marketing_email_templates` table
    - Policies for club members to manage their templates
    - Public templates viewable by all
*/

CREATE TABLE IF NOT EXISTS marketing_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  thumbnail_url text,
  category text NOT NULL DEFAULT 'general',
  email_content_json jsonb,
  email_content_html text,
  is_public boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT templates_org_check CHECK (
    (club_id IS NOT NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NOT NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NOT NULL)
  )
);

ALTER TABLE marketing_email_templates ENABLE ROW LEVEL SECURITY;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_club_id ON marketing_email_templates(club_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_state_id ON marketing_email_templates(state_association_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_national_id ON marketing_email_templates(national_association_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_category ON marketing_email_templates(category);
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_is_public ON marketing_email_templates(is_public);

-- Policy: Club members can view their own templates and public templates
CREATE POLICY "Club members can view own and public templates"
  ON marketing_email_templates
  FOR SELECT
  TO authenticated
  USING (
    is_public = true OR
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = marketing_email_templates.club_id
      AND user_clubs.user_id = auth.uid()
    )) OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM state_association_admins
      WHERE state_association_admins.state_association_id = marketing_email_templates.state_association_id
      AND state_association_admins.user_id = auth.uid()
    )) OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM national_association_admins
      WHERE national_association_admins.national_association_id = marketing_email_templates.national_association_id
      AND national_association_admins.user_id = auth.uid()
    ))
  );

-- Policy: Club admins can create templates
CREATE POLICY "Club admins can create templates"
  ON marketing_email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = marketing_email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )) OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM state_association_admins
      WHERE state_association_admins.state_association_id = marketing_email_templates.state_association_id
      AND state_association_admins.user_id = auth.uid()
    )) OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM national_association_admins
      WHERE national_association_admins.national_association_id = marketing_email_templates.national_association_id
      AND national_association_admins.user_id = auth.uid()
    ))
  );

-- Policy: Club admins can update their templates
CREATE POLICY "Club admins can update own templates"
  ON marketing_email_templates
  FOR UPDATE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = marketing_email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )) OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM state_association_admins
      WHERE state_association_admins.state_association_id = marketing_email_templates.state_association_id
      AND state_association_admins.user_id = auth.uid()
    )) OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM national_association_admins
      WHERE national_association_admins.national_association_id = marketing_email_templates.national_association_id
      AND national_association_admins.user_id = auth.uid()
    ))
  );

-- Policy: Club admins can delete their templates
CREATE POLICY "Club admins can delete own templates"
  ON marketing_email_templates
  FOR DELETE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = marketing_email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )) OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM state_association_admins
      WHERE state_association_admins.state_association_id = marketing_email_templates.state_association_id
      AND state_association_admins.user_id = auth.uid()
    )) OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM national_association_admins
      WHERE national_association_admins.national_association_id = marketing_email_templates.national_association_id
      AND national_association_admins.user_id = auth.uid()
    ))
  );
