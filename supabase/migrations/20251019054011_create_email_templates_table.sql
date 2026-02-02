/*
  # Create Email Templates Table

  1. New Tables
    - `email_templates`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `template_key` (text) - Template identifier (welcome, renewal, event)
      - `subject` (text) - Email subject line
      - `body` (text) - Email body HTML content
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (club_id, template_key)

  2. Security
    - Enable RLS on `email_templates` table
    - Add policy for club admins to read their templates
    - Add policy for club admins to insert their templates
    - Add policy for club admins to update their templates
    - Add policy for club admins to delete their templates

  3. Indexes
    - Index on (club_id, template_key) for fast lookups
*/

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, template_key)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_club_key ON email_templates(club_id, template_key);

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Policy for club admins to read their templates
CREATE POLICY "Club admins can view email templates"
  ON email_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy for club admins to insert templates
CREATE POLICY "Club admins can create email templates"
  ON email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy for club admins to update templates
CREATE POLICY "Club admins can update email templates"
  ON email_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy for club admins to delete templates (for restore to default)
CREATE POLICY "Club admins can delete email templates"
  ON email_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = email_templates.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );