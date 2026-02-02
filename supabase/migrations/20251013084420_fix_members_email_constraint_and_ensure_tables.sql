/*
  # Fix Members Email Constraint and Ensure Required Tables

  ## Overview
  1. Remove unique constraint on members.email (members can belong to multiple clubs)
  2. Ensure membership_applications table exists
  3. Ensure member_invitations table exists
  4. Add proper unique constraint on (club_id, email) instead

  ## Changes
  - Drop members_email_key constraint if it exists
  - Add unique constraint on (club_id, email) to prevent duplicates within same club
  - Ensure all required tables and functions exist

  ## Notes
  - Members can have same email in different clubs
  - Prevents duplicate members within same club
  - Ensures all invitation/application tables exist
*/

-- Drop the email unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'members_email_key'
  ) THEN
    ALTER TABLE members DROP CONSTRAINT members_email_key;
    RAISE NOTICE 'Dropped members_email_key constraint';
  END IF;
END $$;

-- Add unique constraint on club_id + email combination
-- This prevents duplicate members within the same club but allows same email across clubs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'members_club_email_unique'
  ) THEN
    ALTER TABLE members ADD CONSTRAINT members_club_email_unique UNIQUE (club_id, email);
    RAISE NOTICE 'Added members_club_email_unique constraint';
  END IF;
END $$;

-- Ensure member_invitations table exists (from earlier migration)
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

-- Ensure membership_applications table exists (from earlier migration)
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

-- Enable RLS on tables if not already enabled
ALTER TABLE member_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_applications ENABLE ROW LEVEL SECURITY;

-- Ensure RLS policies exist for member_invitations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_invitations' 
    AND policyname = 'Club admins can view invitations'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_invitations' 
    AND policyname = 'Club admins can create invitations'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_invitations' 
    AND policyname = 'Public can view valid invitations by token'
  ) THEN
    CREATE POLICY "Public can view valid invitations by token" ON member_invitations
      FOR SELECT
      TO public
      USING (
        status = 'pending' 
        AND expires_at > now()
      );
  END IF;
END $$;

-- Ensure RLS policies exist for membership_applications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'membership_applications' 
    AND policyname = 'Club admins can view applications'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'membership_applications' 
    AND policyname = 'Users can view own applications'
  ) THEN
    CREATE POLICY "Users can view own applications" ON membership_applications
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'membership_applications' 
    AND policyname = 'Authenticated users can create applications'
  ) THEN
    CREATE POLICY "Authenticated users can create applications" ON membership_applications
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'membership_applications' 
    AND policyname = 'Club admins can update applications'
  ) THEN
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
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_member_invitations_token ON member_invitations(token);
CREATE INDEX IF NOT EXISTS idx_member_invitations_club_id ON member_invitations(club_id);
CREATE INDEX IF NOT EXISTS idx_membership_applications_club_id ON membership_applications(club_id);
CREATE INDEX IF NOT EXISTS idx_membership_applications_status ON membership_applications(status);