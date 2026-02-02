/*
  # Add HTML Content Field to Document Templates

  1. Changes
    - Add `html_content` column to store full WYSIWYG HTML
    - Add `template_type` to differentiate between structured and HTML templates
    - Keep existing `sections` column for backward compatibility
  
  2. Notes
    - New templates will use `html_content` for WYSIWYG editing
    - Old templates can continue using `sections` structure
*/

DO $$
BEGIN
  -- Add html_content column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_templates' AND column_name = 'html_content'
  ) THEN
    ALTER TABLE document_templates 
    ADD COLUMN html_content text;
  END IF;

  -- Add template_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_templates' AND column_name = 'template_type'
  ) THEN
    ALTER TABLE document_templates 
    ADD COLUMN template_type text DEFAULT 'structured' CHECK (template_type IN ('structured', 'html'));
  END IF;

  -- Add page_settings column for page layout preferences
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_templates' AND column_name = 'page_settings'
  ) THEN
    ALTER TABLE document_templates 
    ADD COLUMN page_settings jsonb DEFAULT '{
      "pageSize": "a4",
      "orientation": "portrait",
      "marginTop": 20,
      "marginBottom": 20,
      "marginLeft": 20,
      "marginRight": 20
    }'::jsonb;
  END IF;
END $$;