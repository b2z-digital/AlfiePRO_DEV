/*
  # Add Uploader Tracking to Resources

  1. Changes
    - Add foreign key constraint from resources.created_by to profiles.id
    - This enables tracking who uploaded each resource file
    - The UI will display "Uploaded by [Name]" for each resource

  2. Security
    - Foreign key ensures referential integrity
    - RLS policies already exist to control access to resources
*/

-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'resources_created_by_fkey' 
    AND table_name = 'resources'
  ) THEN
    ALTER TABLE resources
    ADD CONSTRAINT resources_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES profiles(id)
    ON DELETE SET NULL;
  END IF;
END $$;