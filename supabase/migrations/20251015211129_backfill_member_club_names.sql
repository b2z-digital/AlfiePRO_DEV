/*
  # Backfill Member Club Names

  1. Changes
    - Update all existing members who have a club_id but missing club name
    - Sets the club field to the club's name from the clubs table

  2. Notes
    - This fixes existing members who were created before the club name fix
    - Only updates records where club is NULL but club_id exists
*/

-- Update all members with missing club names
UPDATE members
SET club = clubs.name,
    updated_at = now()
FROM clubs
WHERE members.club_id = clubs.id
  AND members.club IS NULL;