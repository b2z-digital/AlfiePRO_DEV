/*
  # Create notifications system

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `sender_id` (uuid, foreign key to auth.users)
      - `recipient_id` (uuid, foreign key to auth.users)
      - `subject` (text)
      - `message` (text)
      - `type` (text - 'general', 'renewal_reminder', 'payment_confirmation', etc.)
      - `status` (text - 'unread', 'read', 'archived')
      - `sent_via_email` (boolean)
      - `email_status` (text - 'pending', 'sent', 'failed')
      - `created_at` (timestamp)
      - `read_at` (timestamp, nullable)

  2. Security
    - Enable RLS on `notifications` table
    - Add policies for club members to read their notifications
    - Add policies for club admins to send notifications
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'general' CHECK (type IN ('general', 'renewal_reminder', 'payment_confirmation', 'welcome', 'announcement')),
  status text DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  sent_via_email boolean DEFAULT false,
  email_status text DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
  created_at timestamptz DEFAULT now(),
  read_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read their own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- Users can update their own notifications (mark as read, etc.)
CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Club admins can send notifications to club members
CREATE POLICY "Club admins can send notifications"
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
  );

-- Club admins can view all notifications for their club
CREATE POLICY "Club admins can view club notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = notifications.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Add trigger to update updated_at
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add index for performance
CREATE INDEX idx_notifications_recipient_status ON notifications(recipient_id, status);
CREATE INDEX idx_notifications_club_created ON notifications(club_id, created_at DESC);