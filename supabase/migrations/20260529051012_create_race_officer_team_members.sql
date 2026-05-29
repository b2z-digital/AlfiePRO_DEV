/*
  # Create Race Officer Team Members System

  1. New Tables
    - `race_officer_team_members`
      - `id` (uuid, primary key)
      - `owner_user_id` (uuid, references auth.users) - the race officer who owns the account
      - `member_user_id` (uuid, references auth.users, nullable) - linked user account (set after they accept)
      - `email` (text) - invited email address
      - `name` (text) - display name
      - `role` (text) - 'admin' or 'viewer'
      - `status` (text) - 'pending', 'active', 'revoked'
      - `invited_at` (timestamptz)
      - `accepted_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `race_officer_team_members` table
    - Owner can manage their own team members
    - Team members can view their own membership records
*/

CREATE TABLE IF NOT EXISTS race_officer_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE race_officer_team_members ENABLE ROW LEVEL SECURITY;

-- Owner can view their team members
CREATE POLICY "Owner can view own team members"
  ON race_officer_team_members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- Owner can insert team members
CREATE POLICY "Owner can invite team members"
  ON race_officer_team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

-- Owner can update their team members
CREATE POLICY "Owner can update own team members"
  ON race_officer_team_members
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Owner can delete team members
CREATE POLICY "Owner can delete own team members"
  ON race_officer_team_members
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- Team members can view their own record
CREATE POLICY "Team members can view own membership"
  ON race_officer_team_members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = member_user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_race_officer_team_owner ON race_officer_team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_race_officer_team_member ON race_officer_team_members(member_user_id);
CREATE INDEX IF NOT EXISTS idx_race_officer_team_email ON race_officer_team_members(email);
