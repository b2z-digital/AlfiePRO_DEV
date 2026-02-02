/*
  # Fix Public Events RLS Policies - Add Schema Qualification
  
  1. Problem
    - RLS policies on public_events table reference 'user_clubs' without schema qualification
    - This causes error: "relation 'user_clubs' does not exist" when policies execute
    
  2. Solution
    - Drop and recreate the "Clubs can create events" policy with proper schema qualification
    - Use 'public.user_clubs' instead of just 'user_clubs'
    
  3. Security
    - Maintains the same security logic - clubs can only create events they have admin/editor access to
    - Just fixes the schema reference issue
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Clubs can create events" ON public.public_events;

-- Recreate with proper schema qualification
CREATE POLICY "Clubs can create events"
  ON public.public_events FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Also fix the "Users can view their club events" policy
DROP POLICY IF EXISTS "Users can view their club events" ON public.public_events;

CREATE POLICY "Users can view their club events"
  ON public.public_events FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM public.user_clubs WHERE user_id = auth.uid()
    )
  );

-- Fix the "Clubs can update their pending events" policy
DROP POLICY IF EXISTS "Clubs can update their pending events" ON public.public_events;

CREATE POLICY "Clubs can update their pending events"
  ON public.public_events FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
    AND approval_status IN ('draft', 'pending', 'rejected')
  )
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Fix the "Clubs can delete their pending events" policy
DROP POLICY IF EXISTS "Clubs can delete their pending events" ON public.public_events;

CREATE POLICY "Clubs can delete their pending events"
  ON public.public_events FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
    AND approval_status IN ('draft', 'pending', 'rejected')
  );