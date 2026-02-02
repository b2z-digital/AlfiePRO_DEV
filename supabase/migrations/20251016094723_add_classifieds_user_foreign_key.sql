/*
  # Add Foreign Key Relationship for Classifieds User

  1. Changes
    - Add foreign key constraint from classifieds.user_id to profiles.id
    - This enables proper joining between classifieds and user profiles
    - Allows fetching user information (name, avatar) with classified listings

  2. Security
    - No RLS changes needed
    - Maintains existing data integrity
*/

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'classifieds_user_id_fkey' 
    AND table_name = 'classifieds'
  ) THEN
    ALTER TABLE classifieds
    ADD CONSTRAINT classifieds_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES profiles(id)
    ON DELETE CASCADE;
  END IF;
END $$;
