/*
  # Add Document Type and Linked Form to Document Templates

  1. Changes
    - Add `document_type` column to store the type of document (nor, si, amendment, etc.)
    - Add `linked_form_id` column to link templates to forms for data-driven document generation
    - Add foreign key constraint to ensure linked forms exist
    - Add index for better query performance on linked_form_id

  2. Security
    - No RLS changes needed as existing policies cover the new columns
*/

-- Add document_type column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_templates' 
    AND column_name = 'document_type'
  ) THEN
    ALTER TABLE document_templates 
    ADD COLUMN document_type text DEFAULT 'other' CHECK (document_type IN ('nor', 'si', 'amendment', 'notice', 'other'));
  END IF;
END $$;

-- Add linked_form_id column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_templates' 
    AND column_name = 'linked_form_id'
  ) THEN
    ALTER TABLE document_templates 
    ADD COLUMN linked_form_id uuid REFERENCES race_forms(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_document_templates_linked_form 
ON document_templates(linked_form_id) 
WHERE linked_form_id IS NOT NULL;

-- Add index for document type filtering
CREATE INDEX IF NOT EXISTS idx_document_templates_document_type 
ON document_templates(document_type);
