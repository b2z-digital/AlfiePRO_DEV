/*
  # Add membership_status column to members table

  This migration adds the missing `membership_status` column to the members table
  which is required by the archive_member and restore_member functions.

  ## Changes

  1. Adds `membership_status` column with values:
     - 'active' (default) - Active member
     - 'archived' - Archived member (soft deleted)
  
  2. Adds archive tracking columns:
     - archived_at - timestamp when archived
     - archived_by - user who archived
     - archive_reason - optional reason
  
  3. Updates RLS policies to exclude archived members from normal queries
*/

-- Add archive tracking columns to members table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE members ADD COLUMN archived_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE members ADD COLUMN archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'archive_reason'
  ) THEN
    ALTER TABLE members ADD COLUMN archive_reason TEXT;
  END IF;
END $$;

-- Add membership_status column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'membership_status'
  ) THEN
    ALTER TABLE members ADD COLUMN membership_status TEXT DEFAULT 'active';
  END IF;
END $$;

-- Migrate existing data
UPDATE members
SET membership_status = CASE 
  WHEN archived_at IS NOT NULL THEN 'archived'
  ELSE 'active'
END
WHERE membership_status IS NULL OR membership_status = 'active';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_members_archived_at ON members(archived_at);
CREATE INDEX IF NOT EXISTS idx_members_membership_status ON members(membership_status) WHERE membership_status IS NOT NULL;

-- Add check constraint to ensure valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'members_membership_status_check'
  ) THEN
    ALTER TABLE members 
    ADD CONSTRAINT members_membership_status_check 
    CHECK (membership_status IN ('active', 'archived'));
  END IF;
END $$;

-- Update RLS policies to exclude archived members by default
-- First drop the existing select policy if it exists
DROP POLICY IF EXISTS "Club members can view members in their club" ON members;

-- Recreate with archived filter
CREATE POLICY "Club members can view members in their club"
  ON members FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs 
      WHERE user_id = auth.uid()
    )
    AND (membership_status = 'active' OR membership_status IS NULL)
  );

-- Add a separate policy for viewing archived members (admins only)
CREATE POLICY "Club admins can view archived members"
  ON members FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
    AND membership_status = 'archived'
  );

-- Add comments
COMMENT ON COLUMN members.membership_status IS 'Member status: active (default) or archived (soft deleted)';
COMMENT ON COLUMN members.archived_at IS 'Timestamp when member was archived. NULL means member is not archived.';
COMMENT ON COLUMN members.archived_by IS 'User who archived this member.';
COMMENT ON COLUMN members.archive_reason IS 'Optional reason for archiving this member.';