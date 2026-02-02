/*
  # Add Google Drive Folder ID to Resource Categories

  1. Changes
    - Add google_drive_folder_id column to resource_categories table
    - This stores the Google Drive folder ID for each category
    - When a category has this set, files uploaded to it should go to Google Drive

  2. Purpose
    - Enable per-category Google Drive folder mapping
    - Allow automatic upload of resources to appropriate Google Drive folders
*/

-- Add Google Drive folder ID column to resource_categories
ALTER TABLE resource_categories
ADD COLUMN IF NOT EXISTS google_drive_folder_id text;

-- Add comment for documentation
COMMENT ON COLUMN resource_categories.google_drive_folder_id IS
'Google Drive folder ID where resources in this category should be stored';
