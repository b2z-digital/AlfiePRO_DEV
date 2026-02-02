/*
  # Add Default YouTube Integration to Associations
  
  1. New Tables
    - `state_association_integrations` - Stores social media integration details for state associations
    - `national_association_integrations` - Stores social media integration details for national associations
    
  2. Changes
    - Create integration tables mirroring club_integrations structure
    - Create functions to copy default integrations to new associations
    - Create triggers to automatically assign default integrations
    - Backfill existing associations with default YouTube integration
    
  3. Security
    - Enable RLS on new tables
    - Add policies for association admins to manage integrations
*/

-- Create state_association_integrations table
CREATE TABLE IF NOT EXISTS state_association_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_association_id UUID NOT NULL REFERENCES state_associations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  page_id TEXT,
  page_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  youtube_channel_id TEXT,
  youtube_channel_name TEXT,
  instagram_user_id TEXT,
  instagram_username TEXT,
  google_analytics_property_id TEXT,
  google_calendar_id TEXT,
  google_email TEXT,
  paypal_merchant_id TEXT,
  paypal_email TEXT,
  is_enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state_association_id, provider)
);

-- Create national_association_integrations table
CREATE TABLE IF NOT EXISTS national_association_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  national_association_id UUID NOT NULL REFERENCES national_associations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  page_id TEXT,
  page_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  youtube_channel_id TEXT,
  youtube_channel_name TEXT,
  instagram_user_id TEXT,
  instagram_username TEXT,
  google_analytics_property_id TEXT,
  google_calendar_id TEXT,
  google_email TEXT,
  paypal_merchant_id TEXT,
  paypal_email TEXT,
  is_enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(national_association_id, provider)
);

-- Create triggers for updated_at
CREATE TRIGGER update_state_association_integrations_updated_at
BEFORE UPDATE ON state_association_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_national_association_integrations_updated_at
BEFORE UPDATE ON national_association_integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE state_association_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE national_association_integrations ENABLE ROW LEVEL SECURITY;

-- Create policies for state associations
CREATE POLICY "State association admins can manage integrations"
ON state_association_integrations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_state_associations usa
    WHERE usa.state_association_id = state_association_integrations.state_association_id
    AND usa.user_id = auth.uid()
    AND usa.role = 'admin'
  )
);

CREATE POLICY "State association members can view integrations"
ON state_association_integrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_state_associations usa
    WHERE usa.state_association_id = state_association_integrations.state_association_id
    AND usa.user_id = auth.uid()
  )
);

-- Create policies for national associations
CREATE POLICY "National association admins can manage integrations"
ON national_association_integrations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_national_associations una
    WHERE una.national_association_id = national_association_integrations.national_association_id
    AND una.user_id = auth.uid()
    AND una.role = 'admin'
  )
);

CREATE POLICY "National association members can view integrations"
ON national_association_integrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_national_associations una
    WHERE una.national_association_id = national_association_integrations.national_association_id
    AND una.user_id = auth.uid()
  )
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_state_association_integrations_provider 
ON state_association_integrations(provider);

CREATE INDEX IF NOT EXISTS idx_state_association_integrations_enabled 
ON state_association_integrations(state_association_id, is_enabled);

CREATE INDEX IF NOT EXISTS idx_national_association_integrations_provider 
ON national_association_integrations(provider);

CREATE INDEX IF NOT EXISTS idx_national_association_integrations_enabled 
ON national_association_integrations(national_association_id, is_enabled);

-- Create function to copy default integrations to state associations
CREATE OR REPLACE FUNCTION copy_default_integrations_to_state_association(target_association_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Copy all default integrations from club_integrations to state association
  INSERT INTO state_association_integrations (
    state_association_id,
    provider,
    page_id,
    page_name,
    access_token,
    refresh_token,
    token_expires_at,
    youtube_channel_id,
    youtube_channel_name,
    instagram_user_id,
    instagram_username,
    google_analytics_property_id,
    google_calendar_id,
    google_email,
    paypal_merchant_id,
    paypal_email,
    is_enabled,
    metadata,
    is_default
  )
  SELECT 
    target_association_id,
    provider,
    page_id,
    page_name,
    access_token,
    refresh_token,
    token_expires_at,
    youtube_channel_id,
    youtube_channel_name,
    instagram_user_id,
    instagram_username,
    google_analytics_property_id,
    google_calendar_id,
    google_email,
    paypal_merchant_id,
    paypal_email,
    is_enabled,
    metadata,
    false
  FROM club_integrations
  WHERE is_default = true
  ON CONFLICT (state_association_id, provider) DO NOTHING;
END;
$$;

-- Create function to copy default integrations to national associations
CREATE OR REPLACE FUNCTION copy_default_integrations_to_national_association(target_association_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Copy all default integrations from club_integrations to national association
  INSERT INTO national_association_integrations (
    national_association_id,
    provider,
    page_id,
    page_name,
    access_token,
    refresh_token,
    token_expires_at,
    youtube_channel_id,
    youtube_channel_name,
    instagram_user_id,
    instagram_username,
    google_analytics_property_id,
    google_calendar_id,
    google_email,
    paypal_merchant_id,
    paypal_email,
    is_enabled,
    metadata,
    is_default
  )
  SELECT 
    target_association_id,
    provider,
    page_id,
    page_name,
    access_token,
    refresh_token,
    token_expires_at,
    youtube_channel_id,
    youtube_channel_name,
    instagram_user_id,
    instagram_username,
    google_analytics_property_id,
    google_calendar_id,
    google_email,
    paypal_merchant_id,
    paypal_email,
    is_enabled,
    metadata,
    false
  FROM club_integrations
  WHERE is_default = true
  ON CONFLICT (national_association_id, provider) DO NOTHING;
END;
$$;

-- Create trigger functions for auto-assignment
CREATE OR REPLACE FUNCTION auto_assign_default_integrations_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM copy_default_integrations_to_state_association(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION auto_assign_default_integrations_national()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM copy_default_integrations_to_national_association(NEW.id);
  RETURN NEW;
END;
$$;

-- Create triggers on association tables
DROP TRIGGER IF EXISTS trigger_auto_assign_default_integrations_state ON state_associations;
CREATE TRIGGER trigger_auto_assign_default_integrations_state
AFTER INSERT ON state_associations
FOR EACH ROW
EXECUTE FUNCTION auto_assign_default_integrations_state();

DROP TRIGGER IF EXISTS trigger_auto_assign_default_integrations_national ON national_associations;
CREATE TRIGGER trigger_auto_assign_default_integrations_national
AFTER INSERT ON national_associations
FOR EACH ROW
EXECUTE FUNCTION auto_assign_default_integrations_national();

-- Backfill existing state associations with default integrations
DO $$
DECLARE
  association_record RECORD;
BEGIN
  FOR association_record IN SELECT id FROM state_associations LOOP
    PERFORM copy_default_integrations_to_state_association(association_record.id);
  END LOOP;
END $$;

-- Backfill existing national associations with default integrations
DO $$
DECLARE
  association_record RECORD;
BEGIN
  FOR association_record IN SELECT id FROM national_associations LOOP
    PERFORM copy_default_integrations_to_national_association(association_record.id);
  END LOOP;
END $$;
