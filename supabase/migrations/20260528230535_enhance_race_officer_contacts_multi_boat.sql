/*
  # Enhance Race Officer Contacts for Multi-Boat Support

  1. Schema Changes
    - Add `division` column (text) for racing division (Junior, Open, Masters, Grand Masters)
    - Add `boats` column (jsonb) to store multiple boats per skipper
      Each boat object: { class: string, sail_number: string, design: string }

  2. Notes
    - Existing single-boat data (boat_class, sail_number, boat_name) remains for backward compatibility
    - The `boats` jsonb array is the new canonical source for multi-boat data
    - On first load, the UI will auto-migrate existing single-boat data into the boats array
*/

-- Add division column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_officer_contacts' AND column_name = 'division'
  ) THEN
    ALTER TABLE race_officer_contacts ADD COLUMN division text DEFAULT '';
  END IF;
END $$;

-- Add boats jsonb column for multi-boat support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_officer_contacts' AND column_name = 'boats'
  ) THEN
    ALTER TABLE race_officer_contacts ADD COLUMN boats jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Backfill: migrate existing single-boat data into boats array where boats is empty
UPDATE race_officer_contacts
SET boats = jsonb_build_array(
  jsonb_build_object(
    'class', COALESCE(boat_class, ''),
    'sail_number', COALESCE(sail_number, ''),
    'design', COALESCE(boat_name, '')
  )
)
WHERE (boats IS NULL OR boats = '[]'::jsonb)
  AND (boat_class != '' OR sail_number != '' OR boat_name != '');
