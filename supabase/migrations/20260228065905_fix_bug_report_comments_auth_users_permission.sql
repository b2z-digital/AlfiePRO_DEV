/*
  # Fix bug report comments RLS - permission denied for auth.users

  1. Problem
    - SELECT and DELETE policies directly query auth.users table
    - The authenticated role cannot access auth.users, causing 403 errors
    - This blocks ALL operations on bug_report_comments (read and write)

  2. Fix
    - Replace all policies that reference auth.users with ones using
      the is_super_admin_user() SECURITY DEFINER function instead
    - Simplify to clean, working policies

  3. Policies after migration
    - INSERT: Authenticated users where user_id = auth.uid()
    - SELECT: Users can see comments on their own reports + super admins see all
    - DELETE: Super admins only (via is_super_admin_user function)
*/

DROP POLICY IF EXISTS "Super admins can view all comments" ON bug_report_comments;
DROP POLICY IF EXISTS "Reporters can view non-internal comments on their reports" ON bug_report_comments;
DROP POLICY IF EXISTS "Users can view comments on own reports" ON bug_report_comments;
DROP POLICY IF EXISTS "Super admins can delete comments" ON bug_report_comments;

CREATE POLICY "Users can view comments on their reports"
  ON bug_report_comments
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM bug_reports
      WHERE bug_reports.id = bug_report_comments.bug_report_id
      AND bug_reports.reported_by = auth.uid()
    )
  );

CREATE POLICY "Super admins can delete comments"
  ON bug_report_comments
  FOR DELETE
  TO authenticated
  USING (is_super_admin_user());