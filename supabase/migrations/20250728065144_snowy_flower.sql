/*
  # Add Page Break Field Type

  1. Updates
    - Add 'page_break' to the form_fields field_type check constraint
    - This allows forms to include page break fields for multi-page forms

  2. Security
    - No changes to existing RLS policies
    - Maintains existing security model
*/

-- Update the check constraint to include 'page_break' field type
ALTER TABLE form_fields 
DROP CONSTRAINT IF EXISTS form_fields_field_type_check;

ALTER TABLE form_fields 
ADD CONSTRAINT form_fields_field_type_check 
CHECK (field_type = ANY (ARRAY[
  'text'::text, 
  'textarea'::text, 
  'number'::text, 
  'date'::text, 
  'checkbox'::text, 
  'radio'::text, 
  'select'::text, 
  'email'::text, 
  'phone'::text, 
  'url'::text, 
  'clubs'::text, 
  'venue'::text,
  'page_break'::text
]));