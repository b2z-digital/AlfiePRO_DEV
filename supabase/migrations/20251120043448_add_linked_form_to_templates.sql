/*
  # Add Linked Form to Document Templates

  1. Changes
    - Add `linked_form_id` column to associate templates with forms
    - This allows templates to use form fields as merge fields
  
  2. Notes
    - Foreign key to race_forms table
    - Nullable - templates can exist without linked forms
*/

DO $$
BEGIN
  -- Add linked_form_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_templates' AND column_name = 'linked_form_id'
  ) THEN
    ALTER TABLE document_templates 
    ADD COLUMN linked_form_id uuid REFERENCES race_forms(id) ON DELETE SET NULL;
  END IF;
END $$;