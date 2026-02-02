/*
  # Create Function to Increment Classified View Count

  1. Function
    - Creates a secure function to increment view counts
    - Uses SECURITY DEFINER to bypass RLS
    - Only allows incrementing the views_count field
    - Returns the updated view count

  2. Security
    - Function is restricted to authenticated users
    - Only increments the count, cannot modify other fields
*/

-- Drop the overly complex policy we just created
DROP POLICY IF EXISTS "Anyone can update view count" ON classifieds;

-- Create a secure function to increment view count
CREATE OR REPLACE FUNCTION increment_classified_view_count(classified_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE classifieds
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = classified_id
  RETURNING views_count INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_classified_view_count TO authenticated;
