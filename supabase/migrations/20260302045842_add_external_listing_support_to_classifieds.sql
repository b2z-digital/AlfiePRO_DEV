/*
  # Add External Listing Support to Classifieds

  1. Changes
    - Add `is_external` boolean column (defaults to false) to mark listings from non-platform users
    - Add `external_contact_name` text column for the external seller's name
    - Add `external_contact_email` text column for the external seller's email
    - Add `external_contact_phone` text column for the external seller's phone
    - Add `created_by_user_id` column to track which admin created an external listing
    - Make `user_id` nullable since external listings don't have a platform user as the seller

  2. Security
    - Super admins and association admins can create external listings
    - Existing RLS policies continue to work for normal listings
    - Add policy for super admins and association admins to create external listings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'is_external'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN is_external boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'external_contact_name'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN external_contact_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'external_contact_email'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN external_contact_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'external_contact_phone'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN external_contact_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classifieds' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE classifieds ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;