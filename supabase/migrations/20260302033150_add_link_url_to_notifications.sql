/*
  # Add link_url column to notifications table

  1. Changes
    - Added `link_url` column to `notifications` table
    - This allows notifications to link directly to the referenced item (article, post, race results, etc.)
    - Recipients can click through to view the shared item

  2. Notes
    - Column is nullable since not all notifications have a related link
    - Existing notifications will have NULL link_url
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'link_url'
  ) THEN
    ALTER TABLE notifications ADD COLUMN link_url text;
  END IF;
END $$;
