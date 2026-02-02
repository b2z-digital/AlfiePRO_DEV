/*
  # Fix resource view count function
  
  1. Changes
    - Update increment_resource_view_count function to use correct table name
    - Change from 'association_resources' to 'resources'
  
  2. Notes
    - The function was referencing a non-existent table
    - This ensures view counts work correctly for all resources
*/

-- Fix the function to use the correct table name
CREATE OR REPLACE FUNCTION increment_resource_view_count(resource_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE resources
  SET view_count = view_count + 1
  WHERE id = resource_id;
END;
$$;