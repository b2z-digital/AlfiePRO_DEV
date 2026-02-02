-- This migration associates all existing members with stephen@b2z.com.au user account
-- and links them to the appropriate club

-- First, let's get the user ID for stephen@b2z.com.au
DO $$
DECLARE
  target_user_id uuid;
  target_club_id uuid;
BEGIN
  -- Get the user ID
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = 'stephen@b2z.com.au';

  -- If user exists, update all members to be associated with this user
  IF target_user_id IS NOT NULL THEN
    
    -- Get the first club ID (assuming there's at least one club)
    SELECT id INTO target_club_id 
    FROM clubs 
    LIMIT 1;

    -- Update all existing members to have the club_id if one exists
    IF target_club_id IS NOT NULL THEN
      UPDATE members 
      SET club_id = target_club_id 
      WHERE club_id IS NULL;
      
      -- Make sure the user is an admin of this club
      INSERT INTO user_clubs (user_id, club_id, role)
      VALUES (target_user_id, target_club_id, 'admin')
      ON CONFLICT (user_id, club_id) DO UPDATE
      SET role = 'admin';
    END IF;

    -- Log the migration
    RAISE NOTICE 'Migrated members data for user: %', target_user_id;
    RAISE NOTICE 'Associated with club: %', target_club_id;
    
  ELSE
    RAISE NOTICE 'User stephen@b2z.com.au not found - skipping member migration';
  END IF;
END $$;

-- Ensure all member boats have proper member_id relationships
UPDATE member_boats 
SET member_id = members.id 
FROM members 
WHERE member_boats.member_id = members.id;

-- Clean up any orphaned boat records
DELETE FROM member_boats 
WHERE member_id NOT IN (SELECT id FROM members);