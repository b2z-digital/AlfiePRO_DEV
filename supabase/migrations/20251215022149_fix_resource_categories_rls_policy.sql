/*
  # Fix Resource Categories RLS Policy

  1. Changes
    - Drop the problematic policy that uses EXISTS subquery
    - Create a simpler policy that allows viewing categories without subqueries
    - Use a less restrictive approach that won't cause 500 errors

  2. Security
    - Categories are now viewable by authenticated users
    - This enables clubs to see state/national association categories
    - Resources themselves still have their own RLS policies
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Anyone can view categories with public resources" ON resource_categories;

-- Create a simpler policy that allows all authenticated users to view categories
-- This is safe because:
-- 1. Categories themselves don't contain sensitive data
-- 2. The actual resources have their own RLS policies (is_public flag)
-- 3. This allows clubs to discover available resources from parent associations
CREATE POLICY "Authenticated users can view all categories"
  ON resource_categories FOR SELECT TO authenticated
  USING (true);
