/*
  # Add mapping key to form fields

  1. Changes
    - Add `mapping_key` column to `form_fields` table
    - This provides a stable identifier for field mapping that won't break when field names change
    - Users can rename fields without breaking event data mapping
  
  2. Notes
    - `mapping_key` is optional (nullable) - only needed for fields that map to event data
    - Standard mapping keys:
      - 'event_name' - Event/regatta name
      - 'event_start_date' - Event start date
      - 'event_end_date' - Event end date
      - 'venue_id' - Venue selection
      - 'venue_name' - Venue name text
      - 'state_association_id' - State association selection
      - 'club_id' - Club selection
      - 'boat_class_name' - Boat class name
      - 'number_of_days' - Number of racing days
*/

-- Add mapping_key column to form_fields
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'form_fields' 
    AND column_name = 'mapping_key'
  ) THEN
    ALTER TABLE form_fields 
    ADD COLUMN mapping_key text;
    
    -- Add comment explaining the purpose
    COMMENT ON COLUMN form_fields.mapping_key IS 'Stable identifier for mapping to event data, independent of field_name. Prevents mapping breakage when field names are changed.';
    
    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_form_fields_mapping_key ON form_fields(mapping_key) WHERE mapping_key IS NOT NULL;
  END IF;
END $$;

-- Update existing NOR template fields with mapping keys
-- Event name fields
UPDATE form_fields 
SET mapping_key = 'event_name' 
WHERE field_name ILIKE '%regatta%name%' 
  AND mapping_key IS NULL;

-- Event start date fields
UPDATE form_fields 
SET mapping_key = 'event_start_date' 
WHERE (field_name ILIKE '%sailing%date%' OR field_name ILIKE '%day%1%date%' OR field_name ILIKE '%start%date%')
  AND mapping_key IS NULL;

-- Event end date fields  
UPDATE form_fields 
SET mapping_key = 'event_end_date' 
WHERE field_name ILIKE '%end%date%'
  AND mapping_key IS NULL;

-- Venue name fields
UPDATE form_fields 
SET mapping_key = 'venue_name' 
WHERE (field_name ILIKE '%location%description%' OR field_name ILIKE '%venue%name%')
  AND field_type IN ('text', 'textarea')
  AND mapping_key IS NULL;

-- Venue ID fields (dropdowns)
UPDATE form_fields 
SET mapping_key = 'venue_id' 
WHERE (field_name ILIKE '%venue%' OR field_name ILIKE '%location%')
  AND field_type = 'select'
  AND mapping_key IS NULL;

-- State association fields
UPDATE form_fields 
SET mapping_key = 'state_association_id' 
WHERE field_name ILIKE '%state%association%'
  AND mapping_key IS NULL;

-- Club fields
UPDATE form_fields 
SET mapping_key = 'club_id' 
WHERE field_name ILIKE '%club%'
  AND mapping_key IS NULL;

-- Boat class fields
UPDATE form_fields 
SET mapping_key = 'boat_class_name' 
WHERE (field_name ILIKE '%class%' OR field_name ILIKE '%yacht%class%' OR field_name ILIKE '%boat%class%')
  AND mapping_key IS NULL;

-- Number of days fields
UPDATE form_fields 
SET mapping_key = 'number_of_days' 
WHERE (field_name ILIKE '%racing%days%' OR field_name ILIKE '%number%days%')
  AND mapping_key IS NULL;