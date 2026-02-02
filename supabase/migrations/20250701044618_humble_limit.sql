/*
  # Add club_integrations table for social media connections
  
  1. New Tables
    - `club_integrations` - Stores social media integration details for clubs
    
  2. Security
    - Enable RLS on the new table
    - Add policies for club admins to manage integrations
*/

-- Create club_integrations table
CREATE TABLE IF NOT EXISTS club_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'meta', 'twitter', etc.
  page_id TEXT,
  page_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(club_id, provider)
);

-- Create trigger for updated_at
CREATE TRIGGER update_club_integrations_updated_at
BEFORE UPDATE ON club_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE club_integrations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Club admins can manage integrations"
ON club_integrations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = club_integrations.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

CREATE POLICY "Club members can view integrations"
ON club_integrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = club_integrations.club_id
    AND uc.user_id = auth.uid()
  )
);