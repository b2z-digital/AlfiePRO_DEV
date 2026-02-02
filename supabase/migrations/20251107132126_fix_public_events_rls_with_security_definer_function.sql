/*
  # Fix Public Events RLS with Security Definer Function
  
  1. Problem
    - RLS policies can't reliably access user_clubs table due to schema resolution issues
    - Error: "relation 'user_clubs' does not exist" in RLS policy context
    
  2. Solution
    - Create security definer functions that explicitly access the tables
    - Use these functions in RLS policies to avoid schema resolution issues
    
  3. Security
    - Functions are SECURITY DEFINER but only perform read operations
    - Maintain the same security logic as before
*/

-- Function to check if user can manage a club (admin or editor)
CREATE OR REPLACE FUNCTION public.user_can_manage_club(user_uuid UUID, club_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_clubs uc
    WHERE uc.user_id = user_uuid
    AND uc.club_id = club_uuid
    AND uc.role IN ('admin', 'editor')
  );
$$;

-- Function to check if user belongs to a club (any role)
CREATE OR REPLACE FUNCTION public.user_belongs_to_club(user_uuid UUID, club_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_clubs uc
    WHERE uc.user_id = user_uuid
    AND uc.club_id = club_uuid
  );
$$;

-- Drop and recreate the RLS policies using the new functions

-- Clubs can create events
DROP POLICY IF EXISTS "Clubs can create events" ON public.public_events;

CREATE POLICY "Clubs can create events"
  ON public.public_events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_manage_club(auth.uid(), club_id)
  );

-- Users can view their club events
DROP POLICY IF EXISTS "Users can view their club events" ON public.public_events;

CREATE POLICY "Users can view their club events"
  ON public.public_events FOR SELECT
  TO authenticated
  USING (
    public.user_belongs_to_club(auth.uid(), club_id)
  );

-- Clubs can update their pending events
DROP POLICY IF EXISTS "Clubs can update their pending events" ON public.public_events;

CREATE POLICY "Clubs can update their pending events"
  ON public.public_events FOR UPDATE
  TO authenticated
  USING (
    public.user_can_manage_club(auth.uid(), club_id)
    AND approval_status IN ('draft', 'pending', 'rejected')
  )
  WITH CHECK (
    public.user_can_manage_club(auth.uid(), club_id)
  );

-- Clubs can delete their pending events
DROP POLICY IF EXISTS "Clubs can delete their pending events" ON public.public_events;

CREATE POLICY "Clubs can delete their pending events"
  ON public.public_events FOR DELETE
  TO authenticated
  USING (
    public.user_can_manage_club(auth.uid(), club_id)
    AND approval_status IN ('draft', 'pending', 'rejected')
  );