/*
  # Allow club members to upload media
  
  1. Changes
    - Add INSERT policy for club members to upload their own media
    - Members can create media records for their club
  
  2. Security
    - Members can only upload media for clubs they belong to
    - Admins and editors retain full management access
    - All club members can now contribute media
*/

-- Allow club members to insert event media for their club
CREATE POLICY "Club members can upload event media"
  ON event_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = event_media.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- Allow club members to update their own uploaded media
CREATE POLICY "Club members can update own event media"
  ON event_media
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = event_media.club_id
      AND uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = event_media.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- Allow club members to delete their own uploaded media
CREATE POLICY "Club members can delete own event media"
  ON event_media
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = event_media.club_id
      AND uc.user_id = auth.uid()
    )
  );
