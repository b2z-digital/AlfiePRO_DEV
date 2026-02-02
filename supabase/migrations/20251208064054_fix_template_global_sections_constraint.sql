/*
  # Fix Event Website Template Global Sections Constraint

  1. Changes
    - Update section_type check constraint to match event_global_sections
    - Change 'navigation' to 'menu' to align with the actual table

  2. Details
    - event_global_sections uses: 'header', 'menu', 'footer'
    - event_website_template_global_sections was incorrectly using 'navigation'
    - This fixes the constraint violation when saving templates
*/

-- Drop the old constraint
ALTER TABLE event_website_template_global_sections 
  DROP CONSTRAINT IF EXISTS event_website_template_global_sections_section_type_check;

-- Add the corrected constraint
ALTER TABLE event_website_template_global_sections 
  ADD CONSTRAINT event_website_template_global_sections_section_type_check 
  CHECK (section_type IN ('header', 'menu', 'footer'));
