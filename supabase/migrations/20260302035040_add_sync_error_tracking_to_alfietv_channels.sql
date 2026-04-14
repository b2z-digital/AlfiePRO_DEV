/*
  # Add sync error tracking to AlfieTV channels

  1. Changes
    - Add `last_sync_error` column to `alfie_tv_channels` to show sync failures in the UI
    - Add `last_sync_attempted_at` column to track when a sync was last attempted (even if failed)

  2. Notes
    - This helps administrators identify and troubleshoot sync issues
    - The sync edge function will update these fields on success or failure
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_channels' AND column_name = 'last_sync_error'
  ) THEN
    ALTER TABLE alfie_tv_channels ADD COLUMN last_sync_error text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_channels' AND column_name = 'last_sync_attempted_at'
  ) THEN
    ALTER TABLE alfie_tv_channels ADD COLUMN last_sync_attempted_at timestamptz;
  END IF;
END $$;