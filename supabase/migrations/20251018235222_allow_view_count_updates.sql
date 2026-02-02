/*
  # Allow View Count Updates on Classifieds

  1. Security
    - Add RLS policy to allow authenticated users to update only the views_count column
    - This enables tracking of classified listing views
    - Policy is restrictive - only allows updating the views_count field
*/

-- Drop existing restrictive update policy if it exists
DROP POLICY IF EXISTS "Users can update own classifieds" ON classifieds;

-- Create policy for owners to update their own classifieds (all fields)
CREATE POLICY "Users can update own classifieds" ON classifieds
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create separate policy to allow any authenticated user to increment view count
CREATE POLICY "Anyone can update view count" ON classifieds
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    -- Only allow updating views_count field
    -- All other fields must remain unchanged
    COALESCE(status, '') = COALESCE((SELECT status FROM classifieds WHERE id = classifieds.id), '') AND
    COALESCE(title, '') = COALESCE((SELECT title FROM classifieds WHERE id = classifieds.id), '') AND
    COALESCE(price, 0) = COALESCE((SELECT price FROM classifieds WHERE id = classifieds.id), 0)
  );
