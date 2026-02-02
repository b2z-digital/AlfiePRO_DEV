/*
  # Fix task_comments foreign key

  1. Changes
    - Add foreign key constraint from task_comments.user_id to profiles.id
    - This allows proper joining between task_comments and profiles table
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'task_comments_user_id_fkey' 
    AND table_name = 'task_comments'
  ) THEN
    ALTER TABLE task_comments
      ADD CONSTRAINT task_comments_user_id_fkey 
      FOREIGN KEY (user_id) 
      REFERENCES profiles(id) 
      ON DELETE CASCADE;
  END IF;
END $$;