/*
  # Member Invitations and Self-Registration System

  ## Overview
  This migration creates a dual-flow system for member onboarding:
  1. **Admin-Initiated**: Admins invite existing members to join the platform
  2. **Self-Registration**: Users register and apply for membership to clubs

  ## New Tables

  ### `member_invitations`
  Tracks invitations sent by admins to members
  - `id` (uuid, primary key)
  - `member_id` (uuid, references members) - The member being invited
  - `club_id` (uuid, references clubs) - The club the member belongs to
  - `email` (text) - Email address for the invitation
  - `token` (text, unique) - Secure token for invitation link
  - `invited_by` (uuid, references auth.users) - Admin who sent invitation
  - `status` (text) - pending, accepted, expired, cancelled
  - `expires_at` (timestamptz) - Invitation expiry (7 days default)
  - `used_at` (timestamptz) - When the invitation was used
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `membership_applications`
  Tracks self-registration applications from users
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users) - User who applied
  - `club_id` (uuid, references clubs) - Club they're applying to
  - `first_name` (text) - Applicant's first name
  - `last_name` (text) - Applicant's last name
  - `email` (text) - Applicant's email
  - `phone` (text) - Optional phone number
  - `message` (text) - Optional application message
  - `status` (text) - pending, approved, rejected
  - `reviewed_by` (uuid, references auth.users) - Admin who reviewed
  - `reviewed_at` (timestamptz) - When it was reviewed
  - `member_id` (uuid, references members) - Created member if approved
  - `rejection_reason` (text) - Optional reason for rejection
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - Enable RLS on both tables
  - Club admins can manage invitations for their clubs
  - Club admins can view and review applications for their clubs
  - Users can view their own applications
  - Authenticated users can create applications

  ## Notes
  - Invitations expire after 7 days by default
  - Self-registration creates pending applications for admin review
  - Matching by email helps link existing member records to new auth users
  - System supports both invited and self-registered users
*/

-- Create member_invitations table
CREATE TABLE IF NOT EXISTS member_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text UNIQUE NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT member_invitations_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- Create membership_applications table
CREATE TABLE IF NOT EXISTS membership_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT membership_applications_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Enable RLS
ALTER TABLE member_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_applications ENABLE ROW LEVEL SECURITY;

-- Create updated_at triggers
CREATE TRIGGER update_member_invitations_updated_at
BEFORE UPDATE ON member_invitations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_membership_applications_updated_at
BEFORE UPDATE ON membership_applications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Policies for member_invitations

-- Club admins can view invitations for their clubs
CREATE POLICY "Club admins can view invitations" ON member_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Club admins can create invitations for their clubs
CREATE POLICY "Club admins can create invitations" ON member_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Club admins can update invitations for their clubs
CREATE POLICY "Club admins can update invitations" ON member_invitations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Allow public to view valid invitations by token (for signup page)
CREATE POLICY "Public can view valid invitations by token" ON member_invitations
  FOR SELECT
  TO public
  USING (
    status = 'pending' 
    AND expires_at > now()
  );

-- Policies for membership_applications

-- Club admins can view applications for their clubs
CREATE POLICY "Club admins can view applications" ON membership_applications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = membership_applications.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Users can view their own applications
CREATE POLICY "Users can view own applications" ON membership_applications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Authenticated users can create applications
CREATE POLICY "Authenticated users can create applications" ON membership_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Club admins can update applications for their clubs (for approval/rejection)
CREATE POLICY "Club admins can update applications" ON membership_applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = membership_applications.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = membership_applications.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_invitations_token ON member_invitations(token);
CREATE INDEX IF NOT EXISTS idx_member_invitations_member_id ON member_invitations(member_id);
CREATE INDEX IF NOT EXISTS idx_member_invitations_club_id ON member_invitations(club_id);
CREATE INDEX IF NOT EXISTS idx_member_invitations_status ON member_invitations(status);
CREATE INDEX IF NOT EXISTS idx_member_invitations_email ON member_invitations(email);

CREATE INDEX IF NOT EXISTS idx_membership_applications_user_id ON membership_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_applications_club_id ON membership_applications(club_id);
CREATE INDEX IF NOT EXISTS idx_membership_applications_status ON membership_applications(status);
CREATE INDEX IF NOT EXISTS idx_membership_applications_email ON membership_applications(email);
CREATE INDEX IF NOT EXISTS idx_membership_applications_member_id ON membership_applications(member_id);

-- Function to generate secure invitation token
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Function to automatically expire old invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void AS $$
BEGIN
  UPDATE member_invitations
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at < now();
END;
$$ LANGUAGE plpgsql;