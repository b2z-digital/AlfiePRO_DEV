/*
  # Create Member Filter Presets System

  1. New Tables
    - `member_filter_presets` - Stores saved filter configurations
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs)
      - `name` (text) - Name of the filter preset
      - `description` (text) - Optional description
      - `filter_config` (jsonb) - Complete filter configuration
      - `is_default` (boolean) - Whether this is the default filter
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `is_shared` (boolean) - Whether all club admins can see/use this

  2. Security
    - Enable RLS on `member_filter_presets` table
    - Policies for club admins to create, read, update, delete their own presets
    - Shared presets visible to all club admins
*/

-- Create member_filter_presets table
CREATE TABLE IF NOT EXISTS member_filter_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  filter_config jsonb NOT NULL,
  is_default boolean DEFAULT false,
  is_shared boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE member_filter_presets ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_member_filter_presets_club 
  ON member_filter_presets(club_id);
CREATE INDEX IF NOT EXISTS idx_member_filter_presets_created_by 
  ON member_filter_presets(created_by);

-- Create unique partial index for default filter per club
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_filter_presets_default
  ON member_filter_presets(club_id)
  WHERE is_default = true;

-- RLS Policies for member_filter_presets

-- Club admins can view their own presets and shared presets
CREATE POLICY "Club admins can view filter presets"
  ON member_filter_presets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = member_filter_presets.club_id
      AND user_clubs.role = 'admin'
    ) AND (
      created_by = auth.uid() OR is_shared = true
    )
  );

-- Club admins can create filter presets
CREATE POLICY "Club admins can create filter presets"
  ON member_filter_presets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = member_filter_presets.club_id
      AND user_clubs.role = 'admin'
    )
    AND created_by = auth.uid()
  );

-- Club admins can update their own presets
CREATE POLICY "Club admins can update own filter presets"
  ON member_filter_presets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = member_filter_presets.club_id
      AND user_clubs.role = 'admin'
    )
    AND created_by = auth.uid()
  )
  WITH CHECK (
    created_by = auth.uid()
  );

-- Club admins can delete their own presets
CREATE POLICY "Club admins can delete own filter presets"
  ON member_filter_presets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = member_filter_presets.club_id
      AND user_clubs.role = 'admin'
    )
    AND created_by = auth.uid()
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_member_filter_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_member_filter_presets_updated_at
  BEFORE UPDATE ON member_filter_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_member_filter_presets_updated_at();
