/*
  # Fix Infinite Recursion in Association RLS Policies

  ## Problem
  The RLS policies on `user_state_associations` and `user_national_associations` 
  have infinite recursion because they query the same table they're protecting.

  ## Solution
  Remove the recursive policies that allow state/national admins to view members.
  Keep only the simple policy that allows users to view their own associations.
  Admins who need to view members can query through the state_associations or
  national_associations tables instead.

  ## Changes
  1. Drop the recursive SELECT policies on both junction tables
  2. Keep the simple "users can view their own" policy
  3. Keep super admin policies (they don't cause recursion)
*/

-- Drop the recursive policies on user_state_associations
DROP POLICY IF EXISTS "State admins can view their association members" 
  ON user_state_associations;

-- Drop the recursive policies on user_national_associations  
DROP POLICY IF EXISTS "National admins can view their association members"
  ON user_national_associations;
