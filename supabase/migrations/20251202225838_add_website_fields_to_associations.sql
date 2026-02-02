/*
  # Add Website Management Fields to Associations

  1. Changes to Tables
    - Add `subdomain_slug` to state_associations
    - Add `custom_domain` to state_associations  
    - Add `domain_status` to state_associations
    - Add `subdomain_slug` to national_associations
    - Add `custom_domain` to national_associations
    - Add `domain_status` to national_associations

  2. Notes
    - Allows state and national associations to have their own websites
    - Subdomain format: {abbreviation}.alfiepro.com.au
    - Domain status: 'draft', 'active', 'custom'
*/

-- Add website fields to state_associations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'state_associations' AND column_name = 'subdomain_slug'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN subdomain_slug text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'state_associations' AND column_name = 'custom_domain'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN custom_domain text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'state_associations' AND column_name = 'domain_status'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN domain_status text DEFAULT 'draft';
  END IF;
END $$;

-- Add website fields to national_associations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'national_associations' AND column_name = 'subdomain_slug'
  ) THEN
    ALTER TABLE national_associations ADD COLUMN subdomain_slug text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'national_associations' AND column_name = 'custom_domain'
  ) THEN
    ALTER TABLE national_associations ADD COLUMN custom_domain text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'national_associations' AND column_name = 'domain_status'
  ) THEN
    ALTER TABLE national_associations ADD COLUMN domain_status text DEFAULT 'draft';
  END IF;
END $$;

-- Create unique indexes on subdomain slugs
CREATE UNIQUE INDEX IF NOT EXISTS idx_state_associations_subdomain_slug 
  ON state_associations(subdomain_slug) WHERE subdomain_slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_national_associations_subdomain_slug 
  ON national_associations(subdomain_slug) WHERE subdomain_slug IS NOT NULL;

-- Auto-populate subdomain_slug from abbreviation for existing associations
UPDATE state_associations 
SET subdomain_slug = LOWER(abbreviation)
WHERE abbreviation IS NOT NULL 
  AND abbreviation != '' 
  AND subdomain_slug IS NULL;

UPDATE national_associations 
SET subdomain_slug = LOWER(abbreviation)
WHERE abbreviation IS NOT NULL 
  AND abbreviation != '' 
  AND subdomain_slug IS NULL;