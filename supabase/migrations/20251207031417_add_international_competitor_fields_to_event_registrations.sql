/*
  # Add International Competitor Fields to Event Registrations

  1. New Columns
    - `guest_address_line1` - First line of international address
    - `guest_address_line2` - Second line of international address
    - `guest_city` - City/Suburb for international addresses
    - `guest_postcode` - Postal code for international addresses
    - `boat_country` - Country code for boat registration (3 letters)
    - `accept_temporary_membership` - Checkbox for temporary membership acceptance
    - `has_liability_insurance` - Checkbox for insurance confirmation
    - `dnm_country` - DNM (Designated National Member) country

  2. Changes
    - Add international address fields for non-Australian registrants
    - Add boat country field to support international boat registrations
    - Add compliance fields for international competitors
*/

-- Add international address fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'guest_address_line1'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN guest_address_line1 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'guest_address_line2'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN guest_address_line2 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'guest_city'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN guest_city text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'guest_postcode'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN guest_postcode text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'boat_country'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN boat_country text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'accept_temporary_membership'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN accept_temporary_membership boolean;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'has_liability_insurance'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN has_liability_insurance boolean;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_registrations' AND column_name = 'dnm_country'
  ) THEN
    ALTER TABLE event_registrations ADD COLUMN dnm_country text;
  END IF;
END $$;