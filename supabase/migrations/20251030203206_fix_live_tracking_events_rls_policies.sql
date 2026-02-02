/*
  # Fix Live Tracking Events RLS Policies
  
  ## Problem
  The current policy uses `FOR ALL` which applies the USING clause to INSERT operations.
  This prevents club admins from creating live tracking events because the row doesn't 
  exist yet when checking the USING clause.
  
  ## Solution
  Split the policy into separate policies for each operation:
  - INSERT: Check user is admin/editor in the club (WITH CHECK only)
  - SELECT: Allow everyone to view enabled events
  - UPDATE: Check user is admin/editor (USING clause)
  - DELETE: Check user is admin/editor (USING clause)
  
  ## Security
  - Club admins/editors can create tracking events for their clubs
  - Public can view enabled events (needed for QR code access)
  - Only admins/editors can modify or delete tracking events
*/

-- Drop the existing overly restrictive policy
DROP POLICY IF EXISTS "Club admins can manage live tracking" ON live_tracking_events;

-- Allow club admins/editors to create tracking events for their clubs
CREATE POLICY "Club admins can create live tracking"
  ON live_tracking_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = club_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- Allow club admins/editors to update tracking events
CREATE POLICY "Club admins can update live tracking"
  ON live_tracking_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = live_tracking_events.club_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- Allow club admins/editors to delete tracking events
CREATE POLICY "Club admins can delete live tracking"
  ON live_tracking_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = live_tracking_events.club_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    )
  );
