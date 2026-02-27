
/*
  # Pending Association Admin Assignments

  ## Purpose
  Allows super admins to pre-assign association admin roles to users by email,
  so that when the user registers/re-registers, they are automatically granted
  the specified role without any further manual steps.

  ## New Tables
  - `pending_association_admin_assignments`
    - `id` (uuid, pk)
    - `email` (text) - the email to watch for on signup
    - `association_type` (text) - 'state' or 'national'
    - `association_id` (uuid) - the association to assign admin role for
    - `role` (text) - role to assign (e.g. 'state_admin')
    - `created_by` (uuid) - super admin who created this
    - `created_at` (timestamptz)
    - `applied_at` (timestamptz) - set when the assignment is applied
    - `applied_to_user_id` (uuid) - the user_id it was applied to

  ## Trigger
  - `apply_pending_association_admin_on_signup` fires after a new profile is
    created (which happens immediately after auth signup). It looks up any
    pending assignments for the new user's email and inserts the appropriate
    rows into `user_state_associations` or `user_national_associations`.

  ## Security
  - RLS enabled; only super admins can insert/update/delete
  - Service role trigger bypasses RLS to apply assignments
*/

CREATE TABLE IF NOT EXISTS pending_association_admin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  association_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'state_admin',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  applied_at timestamptz,
  applied_to_user_id uuid
);

ALTER TABLE pending_association_admin_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage pending assignments"
  ON pending_association_admin_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can insert pending assignments"
  ON pending_association_admin_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update pending assignments"
  ON pending_association_admin_assignments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can delete pending assignments"
  ON pending_association_admin_assignments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Function: apply pending admin assignments when a new profile is created
CREATE OR REPLACE FUNCTION apply_pending_association_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_assignment RECORD;
BEGIN
  -- Get the email for the new user
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Process each pending assignment for this email
  FOR v_assignment IN
    SELECT * FROM pending_association_admin_assignments
    WHERE lower(email) = lower(v_email)
      AND applied_at IS NULL
  LOOP
    IF v_assignment.association_type = 'state' THEN
      INSERT INTO user_state_associations (user_id, state_association_id, role)
      VALUES (NEW.id, v_assignment.association_id, v_assignment.role)
      ON CONFLICT DO NOTHING;
    ELSIF v_assignment.association_type = 'national' THEN
      INSERT INTO user_national_associations (user_id, national_association_id, role)
      VALUES (NEW.id, v_assignment.association_id, v_assignment.role)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Mark as applied
    UPDATE pending_association_admin_assignments
    SET applied_at = now(),
        applied_to_user_id = NEW.id
    WHERE id = v_assignment.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach trigger to profiles (fires after new user profile is created on signup)
DROP TRIGGER IF EXISTS trg_apply_pending_association_admin ON profiles;
CREATE TRIGGER trg_apply_pending_association_admin
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION apply_pending_association_admin_on_signup();

-- Pre-insert Peter Zecchin's NSW State Admin assignment
INSERT INTO pending_association_admin_assignments (email, association_type, association_id, role)
VALUES ('p_zecchin@hotmail.com', 'state', '6ca13a9f-4e6c-41e9-b86d-2bd50e9b7930', 'state_admin');
