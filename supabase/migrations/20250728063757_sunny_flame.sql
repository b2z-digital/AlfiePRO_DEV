/*
  # Add new form field types

  1. Changes
    - Add 'clubs' and 'venue' as valid field types to the form_fields table
    - Update the check constraint to include the new field types

  2. New Field Types
    - `clubs` - Allows users to select from available clubs in the system
    - `venue` - Allows users to select from available venues
*/

-- Update the check constraint to include the new field types
ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check;

ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check 
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
  'venue'::text
]));