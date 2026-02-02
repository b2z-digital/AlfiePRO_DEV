/*
  # Fix Missing User Clubs Entries
  
  1. Purpose
    - Identifies members who have a user_id but are missing their user_clubs entry
    - Creates the missing user_clubs entries with 'member' role
    - Ensures all authenticated members can access their club data
  
  2. Changes
    - Inserts missing user_clubs entries for members with user_id
    - Uses ON CONFLICT to avoid duplicate key errors
    - Sets role to 'member' for all auto-created entries
  
  3. Security
    - No RLS changes needed
    - Uses existing security model
*/

-- Insert missing user_clubs entries for members with user_id
INSERT INTO user_clubs (user_id, club_id, role)
SELECT DISTINCT 
  m.user_id,
  m.club_id,
  'member'::club_role as role
FROM members m
WHERE m.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM user_clubs uc 
    WHERE uc.user_id = m.user_id 
    AND uc.club_id = m.club_id
  )
ON CONFLICT (user_id, club_id) DO NOTHING;
