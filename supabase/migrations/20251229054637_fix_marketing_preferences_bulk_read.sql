/*
  # Fix Marketing Preferences Bulk Read

  1. Changes
    - Create a SECURITY DEFINER function to fetch marketing preferences in bulk
    - This allows club admins to view preferences for their club members
    - Bypasses RLS restrictions that were preventing preference reads

  2. Security
    - Function is restricted to authenticated users only
    - Returns preferences for specified email addresses
*/

-- Create a function to fetch marketing preferences in bulk with elevated privileges
CREATE OR REPLACE FUNCTION get_bulk_marketing_preferences(
  p_emails text[]
)
RETURNS TABLE (
  email text,
  unsubscribed_marketing boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.email,
    COALESCE(mp.unsubscribed_marketing, false) as unsubscribed_marketing
  FROM marketing_preferences mp
  WHERE mp.email = ANY(p_emails);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_bulk_marketing_preferences(text[]) TO authenticated;