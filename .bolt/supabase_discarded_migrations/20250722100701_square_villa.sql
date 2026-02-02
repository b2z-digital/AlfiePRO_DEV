/*
  # Create notifications system

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `recipient_id` (uuid, references auth.users)
      - `sender_id` (uuid, references auth.users, nullable)
      - `club_id` (uuid, references clubs, nullable)
      - `title` (text)
      - `message` (text)
      - `type` (text with check constraint)
      - `is_read` (boolean, default false)
      - `email_sent` (boolean, default false)
      - `email_status` (text, default 'pending')
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `notifications` table
    - Add policies for users to read their own notifications
    - Add policies for club admins to send notifications to club members
    - Add policy for service role to manage all notifications

  3. Functions
    - Create trigger function to update `updated_at` timestamp
*/

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  is_read boolean NOT NULL DEFAULT false,
  email_sent boolean NOT NULL DEFAULT false,
  email_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Add check constraint for notification types
  CONSTRAINT notifications_type_check CHECK (type IN ('general', 'membership', 'event', 'payment', 'announcement', 'reminder')),
  
  -- Add check constraint for email status
  CONSTRAINT notifications_email_status_check CHECK (email_status IN ('pending', 'sent', 'failed', 'not_required'))
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Club admins can send notifications to club members"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = notifications.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
    OR sender_id = auth.uid()
  );

CREATE POLICY "Service role has full access"
  ON notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_club_id ON notifications(club_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_email_status ON notifications(email_status);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notifications_updated_at();