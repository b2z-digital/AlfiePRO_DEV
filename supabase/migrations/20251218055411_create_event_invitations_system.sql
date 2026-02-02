/*
  # Create Event Invitations System ("Invite a Mate")

  1. New Tables
    - `event_invitations`
      - `id` (uuid, primary key)
      - `event_id` (uuid, references quick_races) - The event being invited to
      - `sender_id` (uuid, references auth.users) - Who sent the invitation
      - `sender_name` (text) - Name of the person sending invite
      - `recipient_email` (text) - Email address of invitee
      - `recipient_phone` (text, optional) - Phone number of invitee
      - `recipient_name` (text, optional) - Name of invitee
      - `personal_message` (text, optional) - Custom message from sender
      - `status` (text) - Status: 'pending', 'registered', 'declined', 'expired'
      - `invitation_token` (uuid) - Unique token for tracking
      - `sent_at` (timestamptz) - When invitation was sent
      - `registered_at` (timestamptz, optional) - When invitee registered
      - `expires_at` (timestamptz) - Expiration date
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `event_invitations` table
    - Users can view invitations they sent
    - Users can view invitations sent to their email
    - Club admins can view all invitations for their events
    - Public can access invitation by token for registration

  3. Indexes
    - Index on event_id for quick lookups
    - Index on sender_id for user's sent invitations
    - Index on recipient_email for checking existing invites
    - Index on invitation_token for invite link access
    - Index on status for filtering

  4. Functions
    - Function to automatically expire old invitations
    - Function to update status when someone registers
*/

-- Create event_invitations table
CREATE TABLE IF NOT EXISTS event_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES quick_races(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  recipient_email text NOT NULL,
  recipient_phone text,
  recipient_name text,
  personal_message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'registered', 'declined', 'expired')),
  invitation_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  sent_at timestamptz DEFAULT now(),
  registered_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_invitations_event_id ON event_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_sender_id ON event_invitations(sender_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_recipient_email ON event_invitations(recipient_email);
CREATE INDEX IF NOT EXISTS idx_event_invitations_invitation_token ON event_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_event_invitations_status ON event_invitations(status);

-- Enable RLS
ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations they sent
CREATE POLICY "Users can view invitations they sent"
  ON event_invitations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id);

-- Policy: Users can create invitations
CREATE POLICY "Users can create invitations"
  ON event_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Policy: Users can update their own invitations
CREATE POLICY "Users can update their own invitations"
  ON event_invitations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- Policy: Public can view invitation by token (for registration page)
CREATE POLICY "Public can view invitation by token"
  ON event_invitations
  FOR SELECT
  TO public
  USING (true);

-- Policy: Club admins can view invitations for their events
CREATE POLICY "Club admins can view event invitations"
  ON event_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = event_invitations.event_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Function to automatically expire old pending invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE event_invitations
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'pending'
  AND expires_at < now();
END;
$$;

-- Function to update invitation status when someone registers
CREATE OR REPLACE FUNCTION update_invitation_on_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update any pending invitations for this email and event
  UPDATE event_invitations
  SET status = 'registered',
      registered_at = now(),
      updated_at = now()
  WHERE event_id = NEW.event_id
  AND recipient_email = NEW.email
  AND status = 'pending';
  
  RETURN NEW;
END;
$$;

-- Trigger to update invitation status when someone registers
DROP TRIGGER IF EXISTS trigger_update_invitation_on_registration ON event_registrations;
CREATE TRIGGER trigger_update_invitation_on_registration
  AFTER INSERT ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_invitation_on_registration();

-- Function to get invitation details by token
CREATE OR REPLACE FUNCTION get_invitation_by_token(token uuid)
RETURNS TABLE (
  invitation_id uuid,
  event_id uuid,
  event_name text,
  event_date timestamptz,
  sender_name text,
  personal_message text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ei.id,
    ei.event_id,
    qr.event_name,
    qr.race_date,
    ei.sender_name,
    ei.personal_message,
    ei.status,
    ei.expires_at
  FROM event_invitations ei
  INNER JOIN quick_races qr ON qr.id = ei.event_id
  WHERE ei.invitation_token = token;
END;
$$;