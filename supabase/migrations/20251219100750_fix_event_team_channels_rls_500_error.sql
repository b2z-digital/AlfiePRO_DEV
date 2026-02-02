/*
  # Fix Event Team Channels RLS 500 Error
  
  ## Problem
  The RLS policy on `event_team_channels` is causing a 500 error when querying.
  This is likely due to a circular dependency or issue with the subquery checking `event_channel_members`.
  
  ## Solution
  1. Drop existing policies
  2. Create security definer functions to check permissions
  3. Recreate policies using these functions to avoid circular dependencies
  
  ## Changes
  - Drop all existing RLS policies on `event_team_channels`
  - Create helper functions with SECURITY DEFINER
  - Recreate simpler, more efficient policies
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view channels for their events" ON event_team_channels;
DROP POLICY IF EXISTS "Users can create channels for their events" ON event_team_channels;
DROP POLICY IF EXISTS "Users can update channels for their events" ON event_team_channels;

-- Create security definer function to check if user can access event team channels
CREATE OR REPLACE FUNCTION user_can_access_event_channel(
  p_club_id uuid,
  p_state_association_id uuid,
  p_national_association_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Check if user has access through club membership
  IF p_club_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_clubs 
      WHERE user_id = auth.uid() 
      AND club_id = p_club_id
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Check if user has access through state association
  IF p_state_association_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_state_associations 
      WHERE user_id = auth.uid() 
      AND state_association_id = p_state_association_id
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Check if user has access through national association
  IF p_national_association_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_national_associations 
      WHERE user_id = auth.uid() 
      AND national_association_id = p_national_association_id
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

-- Recreate policies with simpler logic
CREATE POLICY "Users can view channels for their events"
  ON event_team_channels FOR SELECT
  TO authenticated
  USING (
    user_can_access_event_channel(club_id, state_association_id, national_association_id)
  );

CREATE POLICY "Users can create channels for their events"
  ON event_team_channels FOR INSERT
  TO authenticated
  WITH CHECK (
    user_can_access_event_channel(club_id, state_association_id, national_association_id)
  );

CREATE POLICY "Users can update channels for their events"
  ON event_team_channels FOR UPDATE
  TO authenticated
  USING (
    user_can_access_event_channel(club_id, state_association_id, national_association_id)
  )
  WITH CHECK (
    user_can_access_event_channel(club_id, state_association_id, national_association_id)
  );

CREATE POLICY "Users can delete channels for their events"
  ON event_team_channels FOR DELETE
  TO authenticated
  USING (
    user_can_access_event_channel(club_id, state_association_id, national_association_id)
  );
