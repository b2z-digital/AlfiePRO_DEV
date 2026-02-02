/*
  # Remove Conflicting Resource Categories Policy

  1. Changes
    - Drop the old "Organization admins can view their categories" SELECT policy
    - Keep the simpler "Authenticated users can view all categories" policy
    - This resolves the 500 error caused by complex subquery conflicts

  2. Security
    - Categories remain viewable by all authenticated users
    - This is safe because categories are just organizational metadata
    - The actual resources have their own RLS policies
*/

-- Drop the conflicting policy
DROP POLICY IF EXISTS "Organization admins can view their categories" ON resource_categories;
