/*
  # Fix classifieds condition and category check constraints

  1. Changes
    - Update `condition` check constraint to include 'like new' (used by the application form)
    - Update `category` check constraint to include all categories defined in the application
    - Both constraints were too restrictive and didn't match the frontend options

  2. Important Notes
    - The condition constraint had 'excellent' but the app uses 'like new'
    - The category constraint only had 4 values but the app defines 10 categories
*/

ALTER TABLE classifieds DROP CONSTRAINT IF EXISTS classifieds_condition_check;
ALTER TABLE classifieds ADD CONSTRAINT classifieds_condition_check
  CHECK (condition = ANY (ARRAY[
    'new'::text,
    'like new'::text,
    'excellent'::text,
    'good'::text,
    'fair'::text,
    'used'::text
  ]));

ALTER TABLE classifieds DROP CONSTRAINT IF EXISTS classifieds_category_check;
ALTER TABLE classifieds ADD CONSTRAINT classifieds_category_check
  CHECK (category = ANY (ARRAY[
    'yachts'::text,
    'components'::text,
    'accessories'::text,
    'services'::text,
    'sails'::text,
    'equipment'::text,
    'parts'::text,
    'electronics'::text,
    'safety'::text,
    'clothing'::text,
    'trailers'::text,
    'moorings'::text,
    'other'::text
  ]));