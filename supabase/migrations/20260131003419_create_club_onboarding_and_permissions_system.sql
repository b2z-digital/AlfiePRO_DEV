/*
  # Club Onboarding and Admin Permissions System

  1. New Tables
    - `club_admin_assignments` - Track who assigned admins to clubs and when
    
  2. Changes
    - Add `has_admin` boolean to clubs table to track if club has been assigned an admin
    - Add `assigned_by_user_id` to clubs table to track who created/set up the club
    - Add `onboarding_completed` boolean to clubs table
    - Add permission levels to committee_position_definitions
    
  3. Permission Levels
    - admin: Full access to everything
    - editor: Content management (news, media)
    - race_officer: Race management only
    - treasurer: Finance access
    - finance_viewer: View-only finance access
    - member: Standard member access
    
  4. Security
    - State association admins can view all clubs in their state
    - State association admins can only edit clubs without admins
    - Once a club has an admin, state association has read-only access
    - Superadmins (stephen@b2z.com.au) have full access to everything
*/

-- Add new columns to clubs table
ALTER TABLE public.clubs 
ADD COLUMN IF NOT EXISTS has_admin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Create club admin assignments tracking table
CREATE TABLE IF NOT EXISTS public.club_admin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  assigned_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(club_id, user_id)
);

-- Add permission levels to committee position definitions
ALTER TABLE public.committee_position_definitions
ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{"admin": false, "editor": false, "race_officer": false, "treasurer": false, "finance_viewer": false}'::jsonb;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_club_admin_assignments_club_id ON public.club_admin_assignments(club_id);
CREATE INDEX IF NOT EXISTS idx_club_admin_assignments_user_id ON public.club_admin_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_clubs_has_admin ON public.clubs(has_admin);
CREATE INDEX IF NOT EXISTS idx_clubs_assigned_by_user_id ON public.clubs(assigned_by_user_id);

-- Enable RLS
ALTER TABLE public.club_admin_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for club_admin_assignments

-- Superadmin can do everything
CREATE POLICY "Superadmin full access to club admin assignments"
  ON public.club_admin_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'stephen@b2z.com.au'
    )
  );

-- State association admins can view and manage admin assignments for their clubs
CREATE POLICY "State association admins can manage club admin assignments"
  ON public.club_admin_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      JOIN public.user_state_associations usa ON usa.state_association_id = c.state_association_id
      WHERE c.id = club_admin_assignments.club_id
      AND usa.user_id = auth.uid()
    )
  );

-- Club admins can view assignments for their club
CREATE POLICY "Club admins can view their club admin assignments"
  ON public.club_admin_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = club_admin_assignments.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Update clubs RLS policies for state association oversight

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "State association admins can update clubs" ON public.clubs;
DROP POLICY IF EXISTS "State admins can update their clubs" ON public.clubs;

-- State association admins can view all clubs in their state (even with admins)
CREATE POLICY "State association admins can view all their clubs"
  ON public.clubs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = clubs.state_association_id
      AND usa.user_id = auth.uid()
    )
    OR
    -- Superadmin can view all
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'stephen@b2z.com.au'
    )
  );

-- State association admins can only edit clubs WITHOUT admins
CREATE POLICY "State association admins can edit clubs without admins"
  ON public.clubs
  FOR UPDATE
  TO authenticated
  USING (
    (
      has_admin = false
      AND EXISTS (
        SELECT 1 FROM public.user_state_associations usa
        WHERE usa.state_association_id = clubs.state_association_id
        AND usa.user_id = auth.uid()
      )
    )
    OR
    -- Superadmin can edit all
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'stephen@b2z.com.au'
    )
  );

-- Function to automatically set has_admin when first admin is assigned
CREATE OR REPLACE FUNCTION public.update_club_has_admin()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- When a new admin is assigned via user_clubs with role 'admin'
  IF NEW.role = 'admin' THEN
    UPDATE public.clubs
    SET has_admin = true
    WHERE id = NEW.club_id;
    
    -- Also track this assignment if not already tracked
    INSERT INTO public.club_admin_assignments (club_id, user_id, assigned_by_user_id)
    VALUES (NEW.club_id, NEW.user_id, auth.uid())
    ON CONFLICT (club_id, user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update has_admin flag
DROP TRIGGER IF EXISTS trigger_update_club_has_admin ON public.user_clubs;
CREATE TRIGGER trigger_update_club_has_admin
  AFTER INSERT OR UPDATE OF role ON public.user_clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_club_has_admin();

-- Function to check if has_admin should be false when last admin is removed
CREATE OR REPLACE FUNCTION public.check_club_admin_removal()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- When an admin role is removed or changed
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role != 'admin') THEN
    -- Check if there are any other admins for this club
    IF NOT EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE club_id = OLD.club_id
      AND role = 'admin'
      AND (TG_OP = 'DELETE' OR id != NEW.id)
    ) THEN
      -- No more admins, set has_admin to false
      UPDATE public.clubs
      SET has_admin = false
      WHERE id = OLD.club_id;
    END IF;
    
    -- Remove from admin assignments tracking if deleted
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.club_admin_assignments
      WHERE club_id = OLD.club_id AND user_id = OLD.user_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for admin removal
DROP TRIGGER IF EXISTS trigger_check_club_admin_removal ON public.user_clubs;
CREATE TRIGGER trigger_check_club_admin_removal
  AFTER UPDATE OF role OR DELETE ON public.user_clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_club_admin_removal();

-- Backfill has_admin for existing clubs
UPDATE public.clubs c
SET has_admin = EXISTS (
  SELECT 1 FROM public.user_clubs uc
  WHERE uc.club_id = c.id
  AND uc.role = 'admin'
)
WHERE has_admin IS NULL OR has_admin = false;