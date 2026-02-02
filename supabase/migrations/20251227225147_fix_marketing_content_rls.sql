/*
  # Fix Marketing Campaign Content RLS Policies

  Fixes the RLS policies for marketing_campaign_content to allow proper INSERT operations.

  ## Changes
  - Drops existing "FOR ALL" policy
  - Creates separate policies for each operation with proper USING and WITH CHECK clauses
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "View content" ON marketing_campaign_content;
DROP POLICY IF EXISTS "Admins manage content" ON marketing_campaign_content;
DROP POLICY IF EXISTS "Admins create content" ON marketing_campaign_content;
DROP POLICY IF EXISTS "Admins update content" ON marketing_campaign_content;
DROP POLICY IF EXISTS "Admins delete content" ON marketing_campaign_content;

-- Create separate policies for each operation
CREATE POLICY "View content" ON marketing_campaign_content FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_campaign_content.campaign_id
    AND uc.user_id = auth.uid()
  ));

CREATE POLICY "Admins create content" ON marketing_campaign_content FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_campaign_content.campaign_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Admins update content" ON marketing_campaign_content FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_campaign_content.campaign_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_campaign_content.campaign_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Admins delete content" ON marketing_campaign_content FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_campaign_content.campaign_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'super_admin')
  ));
