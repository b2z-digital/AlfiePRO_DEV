/*
  # Extend Integrations for All Platforms
  
  1. Changes
    - Add additional fields to club_integrations table for various platforms
    - Add youtube_channel_id and youtube_channel_name fields
    - Add instagram_user_id and instagram_username fields
    - Add google_analytics_property_id field
    - Add google_calendar_id field
    - Add paypal_merchant_id field
    - Add is_enabled flag for toggling integrations
    
  2. Security
    - Maintain existing RLS policies
*/

-- Add new columns to club_integrations table
DO $$ 
BEGIN
  -- YouTube specific fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'youtube_channel_id'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN youtube_channel_id TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'youtube_channel_name'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN youtube_channel_name TEXT;
  END IF;
  
  -- Instagram specific fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'instagram_user_id'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN instagram_user_id TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'instagram_username'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN instagram_username TEXT;
  END IF;
  
  -- Google Analytics specific field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'google_analytics_property_id'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN google_analytics_property_id TEXT;
  END IF;
  
  -- Google Calendar specific field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'google_calendar_id'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN google_calendar_id TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'google_email'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN google_email TEXT;
  END IF;
  
  -- PayPal specific field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'paypal_merchant_id'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN paypal_merchant_id TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'paypal_email'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN paypal_email TEXT;
  END IF;
  
  -- Enable/disable flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN is_enabled BOOLEAN DEFAULT true;
  END IF;
  
  -- Additional metadata field for flexible data storage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create index on provider for faster lookups
CREATE INDEX IF NOT EXISTS idx_club_integrations_provider 
ON club_integrations(provider);

-- Create index on club_id and is_enabled for faster queries
CREATE INDEX IF NOT EXISTS idx_club_integrations_club_enabled 
ON club_integrations(club_id, is_enabled);