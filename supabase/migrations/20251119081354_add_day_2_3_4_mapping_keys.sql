/*
  # Add Day 2, 3, 4 mapping keys to form fields

  1. Changes
    - Add mapping keys for Day 2, Day 3, Day 4 date fields
    - These will auto-calculate dates based on the event start date
  
  2. Mapping Keys
    - 'event_day_2_date' - Second day of multi-day event
    - 'event_day_3_date' - Third day of multi-day event  
    - 'event_day_4_date' - Fourth day of multi-day event
*/

-- Update Day 2 date fields
UPDATE form_fields 
SET mapping_key = 'event_day_2_date' 
WHERE field_name ILIKE '%day%2%date%'
  AND mapping_key IS NULL;

-- Update Day 3 date fields
UPDATE form_fields 
SET mapping_key = 'event_day_3_date' 
WHERE field_name ILIKE '%day%3%date%'
  AND mapping_key IS NULL;

-- Update Day 4 date fields  
UPDATE form_fields 
SET mapping_key = 'event_day_4_date' 
WHERE field_name ILIKE '%day%4%date%'
  AND mapping_key IS NULL;