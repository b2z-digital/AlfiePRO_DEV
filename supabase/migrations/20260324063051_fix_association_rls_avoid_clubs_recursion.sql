/*
  # Fix infinite recursion in association RLS policies

  1. Problem
    - The policies added in the previous migration join state_associations -> clubs, 
      but clubs RLS already joins clubs -> state_associations, causing infinite recursion
    
  2. Solution
    - Drop the recursive policies
    - Replace with policies that use a SECURITY DEFINER function to bypass RLS 
      and avoid the circular dependency
*/

DROP POLICY IF EXISTS "Club members can view their state association" ON state_associations;
DROP POLICY IF EXISTS "Club members can view their national association" ON national_associations;

CREATE OR REPLACE FUNCTION get_user_state_association_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT c.state_association_id
  FROM user_clubs uc
  JOIN clubs c ON c.id = uc.club_id
  WHERE uc.user_id = p_user_id
    AND c.state_association_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION get_user_national_association_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT sa.national_association_id
  FROM user_clubs uc
  JOIN clubs c ON c.id = uc.club_id
  JOIN state_associations sa ON sa.id = c.state_association_id
  WHERE uc.user_id = p_user_id
    AND sa.national_association_id IS NOT NULL;
$$;

CREATE POLICY "Club members can view their state association"
  ON state_associations
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT get_user_state_association_ids(auth.uid()))
  );

CREATE POLICY "Club members can view their national association"
  ON national_associations
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT get_user_national_association_ids(auth.uid()))
  );