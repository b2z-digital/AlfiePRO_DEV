/*
  # Create increment event website views function

  1. Changes
    - Creates a function to increment view counts for event websites
    - Allows public access to increment views
    - Prevents SQL injection by using parameters

  2. Security
    - Function is SECURITY DEFINER to allow public execution
    - Uses parameterized queries
*/

-- Create function to increment event website views
CREATE OR REPLACE FUNCTION increment_event_website_views(website_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE event_websites
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = website_id;
END;
$$;

-- Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION increment_event_website_views(uuid) TO anon;
GRANT EXECUTE ON FUNCTION increment_event_website_views(uuid) TO authenticated;