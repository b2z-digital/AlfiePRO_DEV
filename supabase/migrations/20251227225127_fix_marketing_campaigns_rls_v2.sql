/*
  # Fix Marketing Campaigns RLS Policies

  Fixes the RLS policies for marketing_campaigns to allow proper INSERT operations.

  ## Changes
  - Drops all existing policies
  - Creates separate policies for each operation with proper USING and WITH CHECK clauses
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "View org campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Admins manage campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Admins create campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Admins update campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Admins delete campaigns" ON marketing_campaigns;

-- Create separate policies for each operation
CREATE POLICY "View org campaigns" ON marketing_campaigns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_id = auth.uid()
    AND club_id = marketing_campaigns.club_id
  ));

CREATE POLICY "Admins create campaigns" ON marketing_campaigns FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_id = auth.uid()
    AND club_id = marketing_campaigns.club_id
    AND role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Admins update campaigns" ON marketing_campaigns FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_id = auth.uid()
    AND club_id = marketing_campaigns.club_id
    AND role IN ('admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_id = auth.uid()
    AND club_id = marketing_campaigns.club_id
    AND role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Admins delete campaigns" ON marketing_campaigns FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_id = auth.uid()
    AND club_id = marketing_campaigns.club_id
    AND role IN ('admin', 'super_admin')
  ));
