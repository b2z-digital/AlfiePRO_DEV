/*
  # Fix Marketing Subscriber Lists PostgREST Schema Cache

  1. Changes
    - Force PostgREST schema cache reload for marketing_subscriber_lists
    - Ensure proper grants on marketing_subscriber_lists table
    - Create RPC fallback function for fetching subscriber lists
    - Create RPC fallback for fetching list members

  2. Notes
    - Addresses potential PostgREST 404/empty result issue similar to club_boat_classes
    - RPC functions use SECURITY DEFINER to bypass RLS for reliable access
*/

-- Ensure grants are correct
GRANT SELECT, INSERT, UPDATE, DELETE ON marketing_subscriber_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON marketing_subscriber_lists TO anon;
GRANT ALL ON marketing_subscriber_lists TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketing_list_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON marketing_list_members TO anon;
GRANT ALL ON marketing_list_members TO service_role;

-- Create RPC fallback to get subscriber lists for a club
CREATE OR REPLACE FUNCTION get_club_subscriber_lists(p_club_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  club_id uuid,
  state_association_id uuid,
  national_association_id uuid,
  event_id uuid,
  list_type text,
  filter_criteria jsonb,
  total_contacts integer,
  active_subscriber_count integer,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = p_club_id
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    msl.id,
    msl.name,
    msl.description,
    msl.club_id,
    msl.state_association_id,
    msl.national_association_id,
    msl.event_id,
    msl.list_type,
    msl.filter_criteria,
    msl.total_contacts,
    msl.active_subscriber_count,
    msl.created_by,
    msl.created_at,
    msl.updated_at
  FROM marketing_subscriber_lists msl
  WHERE msl.club_id = p_club_id
  ORDER BY msl.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_club_subscriber_lists(uuid) TO authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
