/*
  # Email Logs Table

  1. New Tables
    - `email_logs`
      - `id` (uuid, primary key)
      - `member_id` (uuid, foreign key to members)
      - `club_id` (uuid, foreign key to clubs)
      - `email_type` (text, type of email sent)
      - `recipient_email` (text, email address)
      - `subject` (text, email subject)
      - `status` (text, sent/failed/pending)
      - `sent_at` (timestamp)
      - `error_message` (text, if failed)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `email_logs` table
    - Add policies for club admins to view email logs
*/

CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Club admins can view email logs for their club
CREATE POLICY "Club admins can view email logs"
  ON email_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = email_logs.club_id
      AND uc.user_id = uid()
      AND uc.role = 'admin'
    )
  );

-- Service role has full access for sending emails
CREATE POLICY "Service role has full access on email_logs"
  ON email_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add constraint for email status
ALTER TABLE email_logs 
ADD CONSTRAINT email_logs_status_check 
CHECK (status IN ('pending', 'sent', 'failed'));

-- Add constraint for email type
ALTER TABLE email_logs 
ADD CONSTRAINT email_logs_type_check 
CHECK (email_type IN ('welcome', 'application_approved', 'application_rejected', 'renewal_reminder', 'payment_confirmation', 'membership_expired'));

-- Create index for efficient querying
CREATE INDEX idx_email_logs_club_id ON email_logs(club_id);
CREATE INDEX idx_email_logs_member_id ON email_logs(member_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at);