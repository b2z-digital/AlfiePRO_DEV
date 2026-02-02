/*
  # AWS Amplify Integration System

  1. New Tables
    - `aws_amplify_config`
      - Stores AWS Amplify credentials
      - Links to super admin only
    
    - `amplify_custom_domains`
      - Tracks custom domains added to AWS Amplify
      - Links to clubs and event websites
      - Tracks SSL certificate status
      - Tracks domain validation status
  
  2. Updates to dns_records
    - Add amplify_domain_id for tracking
    - Add amplify_ssl_status for SSL tracking
  
  3. Security
    - Enable RLS on all new tables
    - Only super admins can manage AWS config
    - Admins can view their domain status

  4. Functions
    - Helper functions for AWS API integration
*/

-- Create aws_amplify_config table
CREATE TABLE IF NOT EXISTS aws_amplify_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_access_key_id_encrypted text NOT NULL,
  aws_secret_access_key_encrypted text NOT NULL,
  aws_region text NOT NULL DEFAULT 'ap-southeast-2',
  amplify_app_id text NOT NULL,
  cloudfront_distribution_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create amplify_custom_domains table
CREATE TABLE IF NOT EXISTS amplify_custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('club_website', 'event_website')),
  entity_id uuid NOT NULL,
  domain_name text NOT NULL UNIQUE,
  amplify_domain_association_arn text,
  domain_status text DEFAULT 'pending' CHECK (domain_status IN ('pending', 'in_progress', 'available', 'failed', 'updating')),
  certificate_status text DEFAULT 'pending' CHECK (certificate_status IN ('pending', 'in_progress', 'issued', 'failed')),
  certificate_verification_dns_record jsonb,
  domain_verification_status text DEFAULT 'pending',
  status_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_checked_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_amplify_custom_domains_entity ON amplify_custom_domains(entity_id, record_type);
CREATE INDEX IF NOT EXISTS idx_amplify_custom_domains_status ON amplify_custom_domains(domain_status);
CREATE INDEX IF NOT EXISTS idx_amplify_custom_domains_domain ON amplify_custom_domains(domain_name);

-- Add AWS Amplify tracking to dns_records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dns_records' AND column_name = 'amplify_domain_id'
  ) THEN
    ALTER TABLE dns_records
    ADD COLUMN amplify_domain_id uuid REFERENCES amplify_custom_domains(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dns_records' AND column_name = 'is_custom_full_domain'
  ) THEN
    ALTER TABLE dns_records
    ADD COLUMN is_custom_full_domain boolean DEFAULT false;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE aws_amplify_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE amplify_custom_domains ENABLE ROW LEVEL SECURITY;

-- AWS Amplify config policies (only super admins)
CREATE POLICY "Super admins can view aws amplify config"
  ON aws_amplify_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert aws amplify config"
  ON aws_amplify_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update aws amplify config"
  ON aws_amplify_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

-- Amplify custom domains policies (admins can view their domains)
CREATE POLICY "Admins can view amplify custom domains"
  ON amplify_custom_domains FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can insert amplify custom domains"
  ON amplify_custom_domains FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update amplify custom domains"
  ON amplify_custom_domains FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_aws_amplify_config_updated_at()
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

CREATE TRIGGER aws_amplify_config_updated_at
  BEFORE UPDATE ON aws_amplify_config
  FOR EACH ROW
  EXECUTE FUNCTION update_aws_amplify_config_updated_at();

CREATE OR REPLACE FUNCTION update_amplify_custom_domains_updated_at()
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

CREATE TRIGGER amplify_custom_domains_updated_at
  BEFORE UPDATE ON amplify_custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_amplify_custom_domains_updated_at();
