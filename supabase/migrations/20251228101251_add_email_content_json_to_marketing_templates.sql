/*
  # Add email_content_json to marketing_email_templates
  
  1. Changes
    - Add `email_content_json` column for email builder structure
    - Keep `json_structure` for backward compatibility
  
  2. Notes
    - Both columns will coexist
    - Frontend uses email_content_json
*/

-- Add email_content_json column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_email_templates' 
    AND column_name = 'email_content_json'
  ) THEN
    ALTER TABLE marketing_email_templates 
    ADD COLUMN email_content_json jsonb;
  END IF;
END $$;

-- Copy data from json_structure to email_content_json if json_structure exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_email_templates' 
    AND column_name = 'json_structure'
  ) THEN
    UPDATE marketing_email_templates 
    SET email_content_json = json_structure 
    WHERE email_content_json IS NULL AND json_structure IS NOT NULL;
  END IF;
END $$;
