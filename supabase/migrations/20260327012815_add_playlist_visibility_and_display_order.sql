/*
  # Add playlist visibility and display order controls

  1. Modified Tables
    - `alfie_tv_youtube_playlists`
      - `is_visible` (boolean, default true) - Admin toggle to show/hide playlists
      - `display_order` (integer, default 0) - Manual ordering for featured playlists
      - `featured_at` (timestamptz) - When playlist was marked as featured

  2. Indexes
    - Composite index on (is_visible, is_featured, display_order) for efficient queries

  3. Notes
    - All existing playlists default to visible
    - Featured playlists can be ordered via display_order
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_youtube_playlists' AND column_name = 'is_visible'
  ) THEN
    ALTER TABLE alfie_tv_youtube_playlists ADD COLUMN is_visible boolean DEFAULT true NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_youtube_playlists' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE alfie_tv_youtube_playlists ADD COLUMN display_order integer DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_youtube_playlists' AND column_name = 'featured_at'
  ) THEN
    ALTER TABLE alfie_tv_youtube_playlists ADD COLUMN featured_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alfie_tv_youtube_playlists_visibility
  ON alfie_tv_youtube_playlists (is_visible, is_featured, display_order DESC);
