/*
  # Create email logs table

  1. New Tables
    - `email_logs`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `recipient_email` (text)
      - `recipient_name` (text, optional)
      - `email_type` (text)
      - `subject` (text)
      - `content` (text)
      - `status` (text, default 'sent')
      - `sent_at` (timestamp)
      - `error_message` (text, optional)
      - `metadata` (jsonb, optional)

  2. Security
    - Enable RLS on `email_logs` table
    - Add policy for club admins to view their club's email logs
    - Add policy for service role to manage email logs

  3. Indexes
    - Index on club_id for efficient querying
    - Index on recipient_email for lookups
    - Index on sent_at for chronological sorting
    - Index on email_type for filtering
*/

CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text,
  email_type text NOT NULL,
  subject text NOT NULL,
  content text NOT NULL,
  status text DEFAULT 'sent' NOT NULL,
  sent_at timestamptz DEFAULT now() NOT NULL,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_logs_club_id ON email_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_email ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Club admins can view their club's email logs"
  ON email_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_logs.club_id
      AND uc.user_id = uid()
      AND uc.role = 'admin'::club_role
    )
  );

CREATE POLICY "Service role can manage email logs"
  ON email_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add constraint for valid email types
ALTER TABLE email_logs ADD CONSTRAINT email_logs_email_type_check 
  CHECK (email_type IN (
    'welcome',
    'application_approved', 
    'application_rejected',
    'renewal_reminder',
    'payment_confirmation',
    'membership_expired'
  ));

-- Add constraint for valid status values
ALTER TABLE email_logs ADD CONSTRAINT email_logs_status_check 
  CHECK (status IN ('sent', 'failed', 'pending'));