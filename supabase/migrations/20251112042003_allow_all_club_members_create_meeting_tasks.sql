/*
  # Allow all club members to create meeting tasks
  
  1. Changes
    - Add new RLS policy to allow any authenticated club member to create tasks
    - This is important for meeting minutes where any member taking minutes needs to create action items
    
  2. Security
    - Still requires user to be a member of the club
    - User must be authenticated
*/

-- Add policy to allow any club member to create tasks (not just admins/editors)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'club_tasks' 
    AND policyname = 'Club members can create tasks'
  ) THEN
    CREATE POLICY "Club members can create tasks"
      ON club_tasks
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_clubs uc 
          WHERE uc.club_id = club_tasks.club_id 
          AND uc.user_id = auth.uid()
        )
      );
  END IF;
END $$;
