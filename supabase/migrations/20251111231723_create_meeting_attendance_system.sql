/*
  # Create Meeting Attendance System

  1. New Tables
    - `meeting_attendance`
      - `id` (uuid, primary key)
      - `meeting_id` (uuid, references meetings)
      - `member_id` (uuid, references members)
      - `user_id` (uuid, references auth.users)
      - `status` (text: 'attending', 'not_attending', 'maybe')
      - `response_token` (uuid, unique token for email responses)
      - `responded_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Add indexes for performance
    - Add unique constraint on meeting_id + member_id to prevent duplicates

  3. Security
    - Enable RLS on `meeting_attendance` table
    - Add policies for authenticated users to view attendance for their club's meetings
    - Add policies for users to respond to their own invitations
    - Add policy for public access via response_token (for email responses)
*/

-- Create meeting_attendance table
CREATE TABLE IF NOT EXISTS meeting_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('attending', 'not_attending', 'maybe')),
  response_token uuid UNIQUE DEFAULT gen_random_uuid(),
  responded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(meeting_id, member_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting_id ON meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_member_id ON meeting_attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user_id ON meeting_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_response_token ON meeting_attendance(response_token);

-- Enable RLS
ALTER TABLE meeting_attendance ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view attendance for meetings in their clubs
CREATE POLICY "Users can view attendance for their club meetings"
  ON meeting_attendance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      INNER JOIN user_clubs uc ON uc.club_id = m.club_id
      WHERE m.id = meeting_attendance.meeting_id
      AND uc.user_id = auth.uid()
    )
  );

-- Policy: Users can update their own attendance
CREATE POLICY "Users can update their own attendance"
  ON meeting_attendance FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can insert their own attendance
CREATE POLICY "Users can insert their own attendance"
  ON meeting_attendance FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Allow anonymous access via response_token (for email responses)
CREATE POLICY "Allow attendance response via token"
  ON meeting_attendance FOR UPDATE
  TO anon
  USING (response_token IS NOT NULL);

-- Create function to update responded_at timestamp
CREATE OR REPLACE FUNCTION update_meeting_attendance_timestamp()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.responded_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS update_meeting_attendance_timestamp_trigger ON meeting_attendance;
CREATE TRIGGER update_meeting_attendance_timestamp_trigger
  BEFORE UPDATE ON meeting_attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_attendance_timestamp();