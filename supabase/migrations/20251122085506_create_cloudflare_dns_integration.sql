/*
  # Cloudflare DNS Integration System

  1. New Tables
    - `cloudflare_config`
      - Stores Cloudflare API credentials (zone_id, api_token)
      - One config per organization (club, state, national)
      - Encrypted API tokens for security
    
    - `dns_records`
      - Tracks all DNS records created through the system
      - Links to clubs and event websites
      - Stores Cloudflare record IDs for updates/deletions
      - Status tracking (pending, active, failed)
  
  2. Domain Fields
    - Add `subdomain_slug` to clubs table
    - Add `subdomain_slug` and `dns_record_id` to event_websites table
    - Add `domain_status` enum for tracking
  
  3. Security
    - Enable RLS on all new tables
    - Only admins can manage DNS records
    - Encrypt sensitive API credentials

  4. Functions
    - Helper functions for DNS status checks
    - Subdomain validation
*/

-- Create enum for domain status
CREATE TYPE domain_status AS ENUM ('pending', 'active', 'failed', 'custom');

-- Create cloudflare_config table
CREATE TABLE IF NOT EXISTS cloudflare_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_type text NOT NULL CHECK (organization_type IN ('club', 'state_association', 'national_association')),
  organization_id uuid NOT NULL,
  zone_id text NOT NULL,
  api_token_encrypted text NOT NULL,
  base_domain text NOT NULL DEFAULT 'alfiepro.com.au',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(organization_type, organization_id)
);

-- Create dns_records table
CREATE TABLE IF NOT EXISTS dns_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('club_website', 'event_website')),
  entity_id uuid NOT NULL,
  subdomain text NOT NULL,
  full_domain text NOT NULL,
  cloudflare_record_id text,
  dns_type text NOT NULL DEFAULT 'CNAME',
  dns_target text NOT NULL,
  status domain_status DEFAULT 'pending',
  verified_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_dns_records_entity ON dns_records(entity_id, record_type);
CREATE INDEX IF NOT EXISTS idx_dns_records_status ON dns_records(status);
CREATE INDEX IF NOT EXISTS idx_dns_records_subdomain ON dns_records(subdomain);
CREATE INDEX IF NOT EXISTS idx_cloudflare_config_org ON cloudflare_config(organization_type, organization_id);

-- Add domain fields to clubs table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'subdomain_slug'
  ) THEN
    ALTER TABLE clubs ADD COLUMN subdomain_slug text UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'custom_domain'
  ) THEN
    ALTER TABLE clubs ADD COLUMN custom_domain text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'domain_status'
  ) THEN
    ALTER TABLE clubs ADD COLUMN domain_status domain_status DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'dns_verified_at'
  ) THEN
    ALTER TABLE clubs ADD COLUMN dns_verified_at timestamptz;
  END IF;
END $$;

-- Add domain fields to event_websites table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'event_websites' AND column_name = 'subdomain_slug'
  ) THEN
    ALTER TABLE event_websites ADD COLUMN subdomain_slug text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'event_websites' AND column_name = 'domain_status'
  ) THEN
    ALTER TABLE event_websites ADD COLUMN domain_status domain_status DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'event_websites' AND column_name = 'dns_verified_at'
  ) THEN
    ALTER TABLE event_websites ADD COLUMN dns_verified_at timestamptz;
  END IF;
END $$;

-- Create unique constraint on event website subdomain
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'event_websites_subdomain_slug_key'
  ) THEN
    ALTER TABLE event_websites ADD CONSTRAINT event_websites_subdomain_slug_key UNIQUE(subdomain_slug);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE cloudflare_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dns_records ENABLE ROW LEVEL SECURITY;

-- Cloudflare config policies (only super admins can manage)
CREATE POLICY "Super admins can view cloudflare config"
  ON cloudflare_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert cloudflare config"
  ON cloudflare_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update cloudflare config"
  ON cloudflare_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

-- DNS records policies (admins can view their records)
CREATE POLICY "Admins can view dns records"
  ON dns_records FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can insert dns records"
  ON dns_records FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update dns records"
  ON dns_records FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- Helper function to validate subdomain slug
CREATE OR REPLACE FUNCTION validate_subdomain_slug(slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if slug is valid (alphanumeric, hyphens, 3-63 chars)
  IF slug IS NULL OR slug = '' THEN
    RETURN false;
  END IF;
  
  IF length(slug) < 3 OR length(slug) > 63 THEN
    RETURN false;
  END IF;
  
  IF NOT slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN false;
  END IF;
  
  -- Check for reserved words
  IF slug IN ('www', 'api', 'admin', 'mail', 'ftp', 'smtp', 'pop', 'imap', 'localhost', 'staging', 'dev', 'test') THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to generate subdomain from club name
CREATE OR REPLACE FUNCTION generate_subdomain_slug(input_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slug text;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  slug := lower(input_text);
  slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
  slug := regexp_replace(slug, '^-+|-+$', '', 'g');
  slug := substring(slug, 1, 63);
  
  RETURN slug;
END;
$$;

-- Create updated_at trigger for cloudflare_config
CREATE OR REPLACE FUNCTION update_cloudflare_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloudflare_config_updated_at
  BEFORE UPDATE ON cloudflare_config
  FOR EACH ROW
  EXECUTE FUNCTION update_cloudflare_config_updated_at();

-- Create updated_at trigger for dns_records
CREATE OR REPLACE FUNCTION update_dns_records_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dns_records_updated_at
  BEFORE UPDATE ON dns_records
  FOR EACH ROW
  EXECUTE FUNCTION update_dns_records_updated_at();