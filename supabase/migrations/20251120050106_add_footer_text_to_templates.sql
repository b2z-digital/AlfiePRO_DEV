/*
  # Add Footer Text to Document Templates

  1. Changes
    - Add `footer_text` column to store footer content for PDF generation
    - This allows templates to have custom footer text with page numbers
  
  2. Notes
    - Nullable - templates can exist without footer text
    - Supports merge fields like {page} for dynamic content
*/

DO $$
BEGIN
  -- Add footer_text column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_templates' AND column_name = 'footer_text'
  ) THEN
    ALTER TABLE document_templates 
    ADD COLUMN footer_text text;
  END IF;
END $$;