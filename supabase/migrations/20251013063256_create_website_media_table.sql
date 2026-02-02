/*
  # Create website_media table for website builder

  1. New Tables
    - `website_media`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `url` (text) - public URL of the media file
      - `thumbnail_url` (text, nullable) - optional thumbnail URL
      - `name` (text) - original filename
      - `type` (text) - MIME type
      - `size` (integer) - file size in bytes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `website_media` table
    - Add policy for club members to view their club's media
    - Add policy for club admins/editors to insert media
    - Add policy for club admins/editors to delete media
*/

CREATE TABLE IF NOT EXISTS website_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  url text NOT NULL,
  thumbnail_url text,
  name text NOT NULL,
  type text NOT NULL,
  size integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE website_media ENABLE ROW LEVEL SECURITY;

-- Policy: Club members can view their club's media
CREATE POLICY "Club members can view their club's media"
  ON website_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = website_media.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- Policy: Club admins/editors can insert media
CREATE POLICY "Club admins/editors can insert media"
  ON website_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = website_media.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Policy: Club admins/editors can delete media
CREATE POLICY "Club admins/editors can delete media"
  ON website_media
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = website_media.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS website_media_club_id_idx ON website_media(club_id);
CREATE INDEX IF NOT EXISTS website_media_created_at_idx ON website_media(created_at DESC);
