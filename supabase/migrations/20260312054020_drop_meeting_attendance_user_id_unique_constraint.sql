/*
  # Drop redundant unique constraint on meeting_attendance (meeting_id, user_id)

  ## Problem
  The table has UNIQUE(meeting_id, member_id) as the primary deduplication key.
  The additional UNIQUE(meeting_id, user_id) constraint causes failures when a
  person is a member of multiple clubs within a state association — they have
  multiple member rows (different member_id) but the same user_id. Inserting
  attendance for both member rows hits this constraint.

  ## Fix
  Drop the (meeting_id, user_id) unique constraint. The (meeting_id, member_id)
  constraint is sufficient for deduplication at the member level.
*/

ALTER TABLE public.meeting_attendance 
  DROP CONSTRAINT IF EXISTS meeting_attendance_meeting_id_user_id_key;
