/*
  # Ensure all associations have budget categories

  1. Changes
    - Run the ensure_association_system_categories function for all existing associations
    - This will create any missing categories for state and national associations
*/

-- Ensure all state associations have categories
DO $$
DECLARE
  assoc RECORD;
BEGIN
  FOR assoc IN SELECT id FROM state_associations LOOP
    PERFORM ensure_association_system_categories(assoc.id, 'state');
  END LOOP;
END $$;

-- Ensure all national associations have categories
DO $$
DECLARE
  assoc RECORD;
BEGIN
  FOR assoc IN SELECT id FROM national_associations LOOP
    PERFORM ensure_association_system_categories(assoc.id, 'national');
  END LOOP;
END $$;
