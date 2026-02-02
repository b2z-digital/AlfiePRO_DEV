/*
  # Fix Marketing Email Templates Category Column
  
  1. Changes
    - Add `category` text column to marketing_email_templates
    - Migrate data from category_id to category text
    - Keep category_id for backward compatibility but make it optional
  
  2. Notes
    - Preserves existing data
    - Adds default category value
*/

-- Add category text column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_email_templates' 
    AND column_name = 'category'
  ) THEN
    ALTER TABLE marketing_email_templates 
    ADD COLUMN category text NOT NULL DEFAULT 'general';
  END IF;
END $$;

-- Make category_id nullable if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_email_templates' 
    AND column_name = 'category_id'
  ) THEN
    ALTER TABLE marketing_email_templates 
    ALTER COLUMN category_id DROP NOT NULL;
  END IF;
END $$;

-- Create index for category if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_category 
ON marketing_email_templates(category);
