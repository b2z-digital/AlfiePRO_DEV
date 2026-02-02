/*
  # Make html_content nullable in marketing_email_templates
  
  1. Changes
    - Remove NOT NULL constraint from html_content column
    - Frontend uses email_content_html instead
  
  2. Notes
    - Both columns will coexist for backward compatibility
*/

-- Make html_content nullable
ALTER TABLE marketing_email_templates 
ALTER COLUMN html_content DROP NOT NULL;
