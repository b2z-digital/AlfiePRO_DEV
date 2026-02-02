/*
  # Add device fingerprint to camera sources

  1. Changes
    - Add `device_fingerprint` column to `livestream_camera_sources` table
    - This allows tracking which physical device a camera belongs to
    - Enables multiple mobile cameras from different devices
    - Same device reconnecting will update existing camera instead of creating new one

  2. Notes
    - Column is nullable to maintain backward compatibility
    - Existing cameras will have NULL fingerprint
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_camera_sources' AND column_name = 'device_fingerprint'
  ) THEN
    ALTER TABLE livestream_camera_sources ADD COLUMN device_fingerprint text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_camera_sources_device_fingerprint
  ON livestream_camera_sources(livestream_session_id, device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;