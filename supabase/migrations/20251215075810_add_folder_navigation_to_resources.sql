/*
  # Add Folder Navigation Support to Resources

  1. Changes
    - Add `google_drive_folder_path` to track the folder hierarchy
    - Add `google_drive_parent_folder_id` to track the immediate parent folder
    - Add `is_folder` flag to distinguish folders from files
    - Add index on parent_folder_id for efficient folder queries

  2. Purpose
    - Enable browsing nested folder structures in Google Drive
    - Allow users to navigate through folders just like in Google Drive
    - Support recursive syncing of all files in all subfolders
*/

DO $$
BEGIN
  -- Add folder tracking columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resources' AND column_name = 'google_drive_folder_path'
  ) THEN
    ALTER TABLE resources ADD COLUMN google_drive_folder_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resources' AND column_name = 'google_drive_parent_folder_id'
  ) THEN
    ALTER TABLE resources ADD COLUMN google_drive_parent_folder_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resources' AND column_name = 'is_folder'
  ) THEN
    ALTER TABLE resources ADD COLUMN is_folder boolean DEFAULT false;
  END IF;
END $$;

-- Add index for efficient folder queries
CREATE INDEX IF NOT EXISTS idx_resources_parent_folder 
  ON resources(google_drive_parent_folder_id) 
  WHERE google_drive_parent_folder_id IS NOT NULL;