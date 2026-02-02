/*
  # Allow Viewing Categories with Public Resources

  1. Changes
    - Add RLS policy to allow authenticated users to view resource_categories that contain public resources
    - This enables club members to see categories from their state and national associations

  2. Security
    - Only categories that contain at least one public resource are viewable
    - This doesn't expose private association categories
*/

-- Allow authenticated users to view categories that contain public resources
CREATE POLICY "Anyone can view categories with public resources"
  ON resource_categories FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM resources
      WHERE resources.category_id = resource_categories.id
      AND resources.is_public = true
    )
  );
