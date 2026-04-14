/*
  # Add super admin policies for boat_classes

  1. Security Changes
    - Super admins can view all boat classes (including inactive)
    - Super admins can create, update, and delete boat classes
  
  2. Notes
    - Ensures super admins have full access to manage the yacht class system
*/

CREATE POLICY "Super admins can view all boat classes"
  ON boat_classes FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can create boat classes"
  ON boat_classes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update boat classes"
  ON boat_classes FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete boat classes"
  ON boat_classes FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));