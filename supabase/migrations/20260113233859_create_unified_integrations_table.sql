/*
  # Create Unified Integrations Table
  
  1. New Tables
    - `integrations` - Unified table for all integrations (clubs, state, national)
  
  2. Changes
    - Create new integrations table with proper structure
    - Support for YouTube, Facebook, Instagram, Google integrations
    - Credentials stored as JSONB for flexibility
    
  3. Security
    - Enable RLS
    - Policies for organization admins to manage integrations
*/

-- Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id UUID REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id UUID REFERENCES national_associations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'youtube', 'facebook', 'instagram', 'google', etc.
  is_active BOOLEAN DEFAULT true,
  credentials JSONB DEFAULT '{}'::jsonb, -- Stores access tokens, refresh tokens, etc.
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional platform-specific data
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT integrations_org_check CHECK (
    (club_id IS NOT NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NOT NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NOT NULL)
  )
);

-- Create unique constraint for platform per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_club_platform 
  ON integrations(club_id, platform) 
  WHERE club_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_state_platform 
  ON integrations(state_association_id, platform) 
  WHERE state_association_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_national_platform 
  ON integrations(national_association_id, platform) 
  WHERE national_association_id IS NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_integrations_platform ON integrations(platform);
CREATE INDEX IF NOT EXISTS idx_integrations_active ON integrations(is_active);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check organization access
CREATE OR REPLACE FUNCTION check_integration_access(integration_row integrations)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check club access
  IF integration_row.club_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_clubs
      WHERE club_id = integration_row.club_id
      AND user_id = auth.uid()
    );
  END IF;
  
  -- Check state association access
  IF integration_row.state_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM state_association_admins
      WHERE association_id = integration_row.state_association_id
      AND user_id = auth.uid()
    );
  END IF;
  
  -- Check national association access
  IF integration_row.national_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM national_association_admins
      WHERE association_id = integration_row.national_association_id
      AND user_id = auth.uid()
    );
  END IF;
  
  RETURN false;
END;
$$;

-- Create security definer function to check admin access
CREATE OR REPLACE FUNCTION check_integration_admin_access(integration_row integrations)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check club admin access
  IF integration_row.club_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_clubs
      WHERE club_id = integration_row.club_id
      AND user_id = auth.uid()
      AND role = 'admin'
    );
  END IF;
  
  -- Check state association admin access
  IF integration_row.state_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM state_association_admins
      WHERE association_id = integration_row.state_association_id
      AND user_id = auth.uid()
    );
  END IF;
  
  -- Check national association admin access
  IF integration_row.national_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM national_association_admins
      WHERE association_id = integration_row.national_association_id
      AND user_id = auth.uid()
    );
  END IF;
  
  RETURN false;
END;
$$;

-- Policies
CREATE POLICY "Users can view integrations they have access to"
  ON integrations
  FOR SELECT
  TO authenticated
  USING (check_integration_access(integrations));

CREATE POLICY "Admins can manage integrations"
  ON integrations
  FOR ALL
  TO authenticated
  USING (check_integration_admin_access(integrations))
  WITH CHECK (check_integration_admin_access(integrations));

-- Create trigger for updated_at
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing data from club_integrations to integrations
INSERT INTO integrations (
  club_id,
  platform,
  is_active,
  credentials,
  metadata,
  connected_at,
  created_at,
  updated_at
)
SELECT 
  club_id,
  provider as platform,
  COALESCE(is_enabled, true) as is_active,
  jsonb_build_object(
    'access_token', access_token,
    'refresh_token', refresh_token,
    'token_expires_at', token_expires_at,
    'page_id', page_id,
    'page_name', page_name,
    'youtube_channel_id', youtube_channel_id,
    'youtube_channel_name', youtube_channel_name,
    'instagram_user_id', instagram_user_id,
    'instagram_username', instagram_username,
    'google_email', google_email
  ) as credentials,
  COALESCE(metadata, '{}'::jsonb) as metadata,
  connected_at,
  created_at,
  updated_at
FROM club_integrations
ON CONFLICT DO NOTHING;