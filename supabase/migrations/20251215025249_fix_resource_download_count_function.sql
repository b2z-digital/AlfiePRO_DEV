/*
  # Fix resource download count function
  
  1. Changes
    - Update increment_resource_download_count function to use correct table name
    - Change from 'association_resources' to 'resources'
  
  2. Notes
    - The function was referencing a non-existent table
    - This fixes the 404 error when downloading resources
*/

-- Fix the function to use the correct table name
CREATE OR REPLACE FUNCTION increment_resource_download_count(resource_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE resources
  SET download_count = download_count + 1
  WHERE id = resource_id;
END;
$$;