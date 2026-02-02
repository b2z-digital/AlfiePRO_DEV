/*
  # Consolidate Duplicate Permissive RLS Policies - Part 1

  This migration consolidates duplicate permissive policies into single policies
  using OR conditions. Multiple permissive policies for the same action are combined
  to improve security clarity and reduce policy evaluation overhead.

  1. Changes
    - Combines duplicate SELECT policies on classifieds table
    - Combines duplicate policies on committee_positions table
    - Combines duplicate policies on email_logs table
    - Combines duplicate policies on email_templates table
  
  2. Security Impact
    - Improves policy clarity and maintainability
    - Reduces policy evaluation overhead
    - Makes security auditing easier
*/

-- Classifieds: Consolidate SELECT policies
DROP POLICY IF EXISTS "Users can view classifieds" ON public.classifieds;
DROP POLICY IF EXISTS "Public can view active listings" ON public.classifieds;
DROP POLICY IF EXISTS "Users can view their own listings" ON public.classifieds;

CREATE POLICY "Users can view classifieds and own listings"
  ON public.classifieds FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    OR user_id = (SELECT auth.uid())
  );

-- Classifieds: Consolidate INSERT policies
DROP POLICY IF EXISTS "Users can create classifieds" ON public.classifieds;
DROP POLICY IF EXISTS "Users can insert their own listings" ON public.classifieds;

CREATE POLICY "Users can create their own classifieds"
  ON public.classifieds FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Classifieds: Consolidate UPDATE policies
DROP POLICY IF EXISTS "Users can update own classifieds" ON public.classifieds;
DROP POLICY IF EXISTS "Users can update their own listings" ON public.classifieds;

CREATE POLICY "Users can update their own classifieds"
  ON public.classifieds FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Classifieds: Consolidate DELETE policies
DROP POLICY IF EXISTS "Users can delete own classifieds" ON public.classifieds;
DROP POLICY IF EXISTS "Users can delete their own listings" ON public.classifieds;

CREATE POLICY "Users can delete their own classifieds"
  ON public.classifieds FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Committee Positions: Consolidate SELECT policies
DROP POLICY IF EXISTS "Admins or Super Admins can manage committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Club admins can manage committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Club members can view committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Public can view committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Users can view committee positions for their clubs" ON public.committee_positions;

CREATE POLICY "Users can view committee positions"
  ON public.committee_positions FOR SELECT
  TO authenticated
  USING (
    -- Public viewing or members of the club
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
    )
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

-- Committee Positions: Consolidate INSERT policies
DROP POLICY IF EXISTS "Admins or Super Admins can manage committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Admins/editors can insert committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Club admins can manage committee positions" ON public.committee_positions;

CREATE POLICY "Admins can insert committee positions"
  ON public.committee_positions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

-- Committee Positions: Consolidate UPDATE policies
DROP POLICY IF EXISTS "Admins or Super Admins can manage committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Admins/editors can update committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Club admins can manage committee positions" ON public.committee_positions;

CREATE POLICY "Admins can update committee positions"
  ON public.committee_positions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

-- Committee Positions: Consolidate DELETE policies
DROP POLICY IF EXISTS "Admins or Super Admins can manage committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Admins/editors can delete committee positions" ON public.committee_positions;
DROP POLICY IF EXISTS "Club admins can manage committee positions" ON public.committee_positions;

CREATE POLICY "Admins can delete committee positions"
  ON public.committee_positions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR (SELECT public.is_super_admin((SELECT auth.uid())))
  );

-- Email Logs: Consolidate SELECT policies
DROP POLICY IF EXISTS "Club admins can view email logs for their club" ON public.email_logs;
DROP POLICY IF EXISTS "Users can view their own email logs" ON public.email_logs;

CREATE POLICY "Users can view email logs"
  ON public.email_logs FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_logs.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  );

-- Email Logs: Consolidate INSERT policies
DROP POLICY IF EXISTS "Club admins can insert email logs for their club" ON public.email_logs;
DROP POLICY IF EXISTS "Users can insert their own email logs" ON public.email_logs;

CREATE POLICY "Users can insert email logs"
  ON public.email_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_logs.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  );

-- Email Logs: Consolidate UPDATE policies
DROP POLICY IF EXISTS "Club admins can update email logs for their club" ON public.email_logs;
DROP POLICY IF EXISTS "Users can update their own email logs" ON public.email_logs;

CREATE POLICY "Users can update email logs"
  ON public.email_logs FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_logs.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_logs.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  );

-- Email Logs: Consolidate DELETE policies
DROP POLICY IF EXISTS "Club admins can delete email logs for their club" ON public.email_logs;
DROP POLICY IF EXISTS "Users can delete their own email logs" ON public.email_logs;

CREATE POLICY "Users can delete email logs"
  ON public.email_logs FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_logs.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  );

-- Email Templates: Consolidate SELECT policies
DROP POLICY IF EXISTS "Club admins can manage email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Club admins can view email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Club members can view email templates" ON public.email_templates;

CREATE POLICY "Users can view email templates for their clubs"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_templates.club_id
        AND uc.user_id = (SELECT auth.uid())
    )
  );

-- Email Templates: Consolidate INSERT policies
DROP POLICY IF EXISTS "Club admins can create email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Club admins can manage email templates" ON public.email_templates;

CREATE POLICY "Club admins can create email templates"
  ON public.email_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_templates.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  );

-- Email Templates: Consolidate UPDATE policies
DROP POLICY IF EXISTS "Club admins can manage email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Club admins can update email templates" ON public.email_templates;

CREATE POLICY "Club admins can update email templates"
  ON public.email_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_templates.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_templates.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  );

-- Email Templates: Consolidate DELETE policies
DROP POLICY IF EXISTS "Club admins can delete email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Club admins can manage email templates" ON public.email_templates;

CREATE POLICY "Club admins can delete email templates"
  ON public.email_templates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = email_templates.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role = 'admin'
    )
  );
