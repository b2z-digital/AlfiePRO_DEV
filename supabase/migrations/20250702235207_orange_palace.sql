/*
  # Email Templates Table

  This migration creates a table for storing email templates for clubs.
  Each club can have multiple templates for different purposes (welcome, renewal, event).
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

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON email_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create RLS policies
CREATE POLICY "Club admins can manage email templates"
  ON email_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

CREATE POLICY "Club members can view email templates"
  ON email_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_templates.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- Create function to create email_templates table if it doesn't exist
CREATE OR REPLACE FUNCTION create_email_templates_table()
RETURNS void AS $$
BEGIN
  -- This function is a placeholder since we're creating the table directly
  -- It's here to provide a way for the application to check if the table exists
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create index on club_id
CREATE INDEX IF NOT EXISTS idx_email_templates_club_id ON email_templates(club_id);

-- Create index on template_key
CREATE INDEX IF NOT EXISTS idx_email_templates_template_key ON email_templates(template_key);

-- Insert default templates for existing clubs
INSERT INTO email_templates (club_id, template_key, subject, body)
SELECT 
  id as club_id,
  'welcome' as template_key,
  'Welcome to ' || name || '!' as subject,
  '<p>Welcome to ' || name || '! We''re excited to have you join us.</p><p>Your membership is now active, and you can start enjoying all the benefits of being a member.</p><p>If you have any questions, please don''t hesitate to contact us.</p>' as body
FROM clubs
ON CONFLICT (club_id, template_key) DO NOTHING;

INSERT INTO email_templates (club_id, template_key, subject, body)
SELECT 
  id as club_id,
  'renewal' as template_key,
  'Your ' || name || ' membership is due for renewal' as subject,
  '<p>Your membership with ' || name || ' is due for renewal soon.</p><p>To continue enjoying all the benefits of membership, please renew before your expiry date.</p><p>Thank you for your continued support!</p>' as body
FROM clubs
ON CONFLICT (club_id, template_key) DO NOTHING;

INSERT INTO email_templates (club_id, template_key, subject, body)
SELECT 
  id as club_id,
  'event' as template_key,
  'New event announcement from ' || name as subject,
  '<p>We''re excited to announce a new event at ' || name || '.</p><p>Please check the details and let us know if you''ll be attending.</p><p>We look forward to seeing you there!</p>' as body
FROM clubs
ON CONFLICT (club_id, template_key) DO NOTHING;