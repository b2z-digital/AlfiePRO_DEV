/*
  # Create Membership Renewal System

  1. New Tables
    - `membership_renewal_notifications` - Tracks sent renewal reminders to prevent duplicates
      - `id` (uuid, primary key)
      - `member_id` (uuid, references members)
      - `club_id` (uuid, references clubs)
      - `renewal_date` (date) - When membership expires
      - `notification_date` (date) - When notification was sent
      - `notification_type` ('30_days' | '14_days' | '7_days' | '1_day' | 'expired' | 'custom')
      - `days_before_expiry` (integer)
      - `sent_at` (timestamptz)
      - `email_sent` (boolean)
      - `in_app_sent` (boolean)
      - `notification_id` (uuid, references notifications)
      - `created_at` (timestamptz)

  2. Changes to `clubs` table
    - Add `renewal_grace_period_days` (integer) - Days after expiry before access is revoked
    - Add `renewal_email_template` (text) - Custom email template for renewals
    - Note: auto_renewal_enabled and renewal_notification_days already exist

  3. Security
    - Enable RLS on new tables
    - Add policies for admin and member access
    
  4. Indexes
    - Index on member_id, notification_type for quick lookups
    - Index on renewal_date for finding expiring memberships
    
  5. Functions
    - get_expiring_memberships() - Returns members with upcoming expiry
    - get_overdue_memberships() - Returns members past expiry
    - should_send_renewal_notification() - Checks if notification already sent
*/

-- Add additional renewal settings to clubs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'renewal_grace_period_days'
  ) THEN
    ALTER TABLE clubs ADD COLUMN renewal_grace_period_days integer DEFAULT 7;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'renewal_email_template'
  ) THEN
    ALTER TABLE clubs ADD COLUMN renewal_email_template text;
  END IF;
END $$;

-- Create membership renewal notifications table
CREATE TABLE IF NOT EXISTS membership_renewal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  renewal_date date NOT NULL,
  notification_date date NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('30_days', '14_days', '7_days', '1_day', 'expired', 'custom')),
  days_before_expiry integer,
  sent_at timestamptz DEFAULT now(),
  email_sent boolean DEFAULT false,
  in_app_sent boolean DEFAULT false,
  notification_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_renewal_notifications_member 
  ON membership_renewal_notifications(member_id);

CREATE INDEX IF NOT EXISTS idx_renewal_notifications_club 
  ON membership_renewal_notifications(club_id);

CREATE INDEX IF NOT EXISTS idx_renewal_notifications_type 
  ON membership_renewal_notifications(notification_type);

CREATE INDEX IF NOT EXISTS idx_renewal_notifications_date 
  ON membership_renewal_notifications(renewal_date);

-- Create unique constraint to prevent duplicate notifications
CREATE UNIQUE INDEX IF NOT EXISTS idx_renewal_notifications_unique 
  ON membership_renewal_notifications(member_id, notification_type, renewal_date);

-- Create index on members.renewal_date for finding expiring memberships
CREATE INDEX IF NOT EXISTS idx_members_renewal_date 
  ON members(renewal_date) WHERE renewal_date IS NOT NULL;

-- Enable RLS
ALTER TABLE membership_renewal_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for membership_renewal_notifications
CREATE POLICY "Club admins can view renewal notifications"
  ON membership_renewal_notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = membership_renewal_notifications.club_id 
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Members can view their own renewal notifications"
  ON membership_renewal_notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m 
      WHERE m.id = membership_renewal_notifications.member_id 
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert renewal notifications"
  ON membership_renewal_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to get expiring memberships
CREATE OR REPLACE FUNCTION get_expiring_memberships(p_club_id uuid, p_days_ahead integer DEFAULT 30)
RETURNS TABLE (
  member_id uuid,
  first_name text,
  last_name text,
  email text,
  renewal_date date,
  days_until_expiry integer,
  membership_level text,
  is_financial boolean,
  phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.first_name,
    m.last_name,
    m.email,
    m.renewal_date,
    (m.renewal_date - CURRENT_DATE)::integer as days_until_expiry,
    m.membership_level,
    m.is_financial,
    m.phone
  FROM members m
  WHERE m.club_id = p_club_id
    AND m.renewal_date IS NOT NULL
    AND m.renewal_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + p_days_ahead)
    AND (m.membership_status = 'active' OR m.membership_status IS NULL)
  ORDER BY m.renewal_date ASC;
END;
$$;

-- Function to get overdue memberships
CREATE OR REPLACE FUNCTION get_overdue_memberships(p_club_id uuid)
RETURNS TABLE (
  member_id uuid,
  first_name text,
  last_name text,
  email text,
  renewal_date date,
  days_overdue integer,
  membership_level text,
  grace_period_expired boolean,
  phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grace_period integer;
BEGIN
  -- Get club's grace period
  SELECT renewal_grace_period_days INTO v_grace_period
  FROM clubs
  WHERE id = p_club_id;
  
  IF v_grace_period IS NULL THEN
    v_grace_period := 7; -- Default grace period
  END IF;

  RETURN QUERY
  SELECT 
    m.id,
    m.first_name,
    m.last_name,
    m.email,
    m.renewal_date,
    (CURRENT_DATE - m.renewal_date)::integer as days_overdue,
    m.membership_level,
    (CURRENT_DATE - m.renewal_date) > v_grace_period as grace_period_expired,
    m.phone
  FROM members m
  WHERE m.club_id = p_club_id
    AND m.renewal_date IS NOT NULL
    AND m.renewal_date < CURRENT_DATE
    AND (m.membership_status = 'active' OR m.membership_status IS NULL)
  ORDER BY m.renewal_date ASC;
END;
$$;

-- Function to check if renewal notification should be sent
CREATE OR REPLACE FUNCTION should_send_renewal_notification(
  p_member_id uuid,
  p_notification_type text,
  p_renewal_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Check if notification already sent for this type and renewal period
  SELECT EXISTS(
    SELECT 1 
    FROM membership_renewal_notifications
    WHERE member_id = p_member_id
      AND notification_type = p_notification_type
      AND renewal_date = p_renewal_date
  ) INTO v_exists;
  
  RETURN NOT v_exists;
END;
$$;

-- Update default grace period for existing clubs
UPDATE clubs 
SET renewal_grace_period_days = 7
WHERE renewal_grace_period_days IS NULL;
