/*
  # Create AlfieTV Channel Suggestions System

  ## Overview
  Allows users to suggest new YouTube channels for AlfieTV

  ## Tables Created
  - `alfie_tv_channel_suggestions` - Stores channel suggestions from users

  ## Columns
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable) - User who made the suggestion
  - `channel_name` (text) - Suggested channel name
  - `channel_url` (text) - YouTube channel URL
  - `description` (text, nullable) - Reason for suggestion
  - `status` (text) - pending, approved, rejected
  - `created_at` (timestamptz) - When suggestion was made
  - `reviewed_at` (timestamptz, nullable) - When reviewed
  - `reviewed_by` (uuid, nullable) - Superadmin who reviewed

  ## Security
  - Enable RLS
  - Users can insert their own suggestions
  - Users can view their own suggestions
  - Super admins can view and update all suggestions
*/

-- Create channel suggestions table
CREATE TABLE IF NOT EXISTS alfie_tv_channel_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel_name text NOT NULL,
  channel_url text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE alfie_tv_channel_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own suggestions
CREATE POLICY "Users can insert own suggestions"
  ON alfie_tv_channel_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own suggestions
CREATE POLICY "Users can view own suggestions"
  ON alfie_tv_channel_suggestions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Super admins can view all suggestions
CREATE POLICY "Super admins can view all suggestions"
  ON alfie_tv_channel_suggestions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

-- Super admins can update suggestions (review them)
CREATE POLICY "Super admins can update suggestions"
  ON alfie_tv_channel_suggestions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_channel_suggestions_status ON alfie_tv_channel_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_channel_suggestions_user_id ON alfie_tv_channel_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_suggestions_created_at ON alfie_tv_channel_suggestions(created_at DESC);
