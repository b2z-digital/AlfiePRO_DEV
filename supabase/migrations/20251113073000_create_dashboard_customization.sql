/*
  # Dashboard Customization System

  1. New Tables
    - `user_dashboard_layouts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `club_id` (uuid, foreign key to clubs) - optional, for club-specific layouts
      - `layout_data` (jsonb) - stores widget positions, sizes, and configurations
      - `is_default` (boolean) - whether this is the user's default layout
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_dashboard_layouts` table
    - Add policies for users to manage their own layouts
*/

-- Create user_dashboard_layouts table
CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  layout_data jsonb NOT NULL DEFAULT '{"widgets": [], "version": 1}'::jsonb,
  is_default boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_user_id ON user_dashboard_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_club_id ON user_dashboard_layouts(club_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_user_club ON user_dashboard_layouts(user_id, club_id);

-- Enable RLS
ALTER TABLE user_dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own layouts
CREATE POLICY "Users can view own dashboard layouts"
  ON user_dashboard_layouts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own layouts
CREATE POLICY "Users can create own dashboard layouts"
  ON user_dashboard_layouts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own layouts
CREATE POLICY "Users can update own dashboard layouts"
  ON user_dashboard_layouts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own layouts
CREATE POLICY "Users can delete own dashboard layouts"
  ON user_dashboard_layouts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dashboard_layout_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_dashboard_layout_updated_at_trigger ON user_dashboard_layouts;
CREATE TRIGGER update_dashboard_layout_updated_at_trigger
  BEFORE UPDATE ON user_dashboard_layouts
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboard_layout_updated_at();
