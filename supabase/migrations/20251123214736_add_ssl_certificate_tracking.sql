/*
  # Add SSL Certificate Status Tracking

  1. Schema Changes
    - Add `ssl_status` column to `dns_records` table
    - Add `ssl_verified_at` timestamp to `dns_records` table
    - Add `ssl_error_message` for troubleshooting
    - Add `website_published` boolean to clubs and event_websites

  2. Security
    - No RLS changes needed (inherits from existing policies)
*/

-- Add SSL certificate status tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dns_records' AND column_name = 'ssl_status'
  ) THEN
    ALTER TABLE dns_records
    ADD COLUMN ssl_status text DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'provisioning', 'active', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dns_records' AND column_name = 'ssl_verified_at'
  ) THEN
    ALTER TABLE dns_records
    ADD COLUMN ssl_verified_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dns_records' AND column_name = 'ssl_error_message'
  ) THEN
    ALTER TABLE dns_records
    ADD COLUMN ssl_error_message text;
  END IF;
END $$;

-- Add website_published flag to clubs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'website_published'
  ) THEN
    ALTER TABLE clubs
    ADD COLUMN website_published boolean DEFAULT false;
  END IF;
END $$;

-- Add website_published flag to event_websites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_websites' AND column_name = 'website_published'
  ) THEN
    ALTER TABLE event_websites
    ADD COLUMN website_published boolean DEFAULT false;
  END IF;
END $$;