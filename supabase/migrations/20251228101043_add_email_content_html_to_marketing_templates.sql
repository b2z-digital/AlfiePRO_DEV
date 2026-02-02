/*
  # Add email_content_html to marketing_email_templates
  
  1. Changes
    - Add `email_content_html` column for rendered HTML output
    - Keep `html_content` for backward compatibility
  
  2. Notes
    - Both columns will coexist
    - Frontend uses email_content_html
*/

-- Add email_content_html column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_email_templates' 
    AND column_name = 'email_content_html'
  ) THEN
    ALTER TABLE marketing_email_templates 
    ADD COLUMN email_content_html text;
  END IF;
END $$;

-- Copy data from html_content to email_content_html if html_content exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketing_email_templates' 
    AND column_name = 'html_content'
  ) THEN
    UPDATE marketing_email_templates 
    SET email_content_html = html_content 
    WHERE email_content_html IS NULL AND html_content IS NOT NULL;
  END IF;
END $$;
