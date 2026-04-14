/*
  # Fix bug report comments insert policies

  1. Changes
    - Drop redundant INSERT policies that may cause confusion
    - Keep a single clean INSERT policy for all authenticated users
    - The simple policy just checks user_id = auth.uid()

  2. Security
    - All authenticated users can add comments (user_id must match their auth id)
    - Super admin specific policies are removed as they are redundant
*/

DROP POLICY IF EXISTS "Super admins can comment on any report" ON bug_report_comments;
DROP POLICY IF EXISTS "Super admins can insert comments" ON bug_report_comments;
DROP POLICY IF EXISTS "Users can comment on own reports" ON bug_report_comments;

DROP POLICY IF EXISTS "Authenticated users can add comments" ON bug_report_comments;
CREATE POLICY "Authenticated users can add comments"
  ON bug_report_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());