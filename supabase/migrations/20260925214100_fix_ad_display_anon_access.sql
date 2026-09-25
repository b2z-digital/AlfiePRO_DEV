/*
# Fix: Restore anon SELECT on ad_campaigns for ad banner display

The ad_banners public SELECT policy joins to ad_campaigns to check if
the campaign is active. Revoking anon SELECT on ad_campaigns breaks
public ad display. Restore limited anon access to active campaigns only.

Also grant anon SELECT on ad_campaign_placements and ad_campaign_targeting
since ad rendering needs these to match placements to pages.
*/

GRANT SELECT ON ad_campaigns TO anon;
GRANT SELECT ON ad_campaign_placements TO anon;
GRANT SELECT ON ad_campaign_targeting TO anon;

-- Add scoped anon SELECT policies for ad display
DROP POLICY IF EXISTS "Anon view active campaigns" ON ad_campaigns;
CREATE POLICY "Anon view active campaigns" ON ad_campaigns FOR SELECT TO anon
  USING (is_active = true AND (start_date IS NULL OR start_date <= CURRENT_DATE) AND (end_date IS NULL OR end_date >= CURRENT_DATE));

DROP POLICY IF EXISTS "Anon view campaign placements" ON ad_campaign_placements;
CREATE POLICY "Anon view campaign placements" ON ad_campaign_placements FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon view targeting" ON ad_campaign_targeting;
CREATE POLICY "Anon view targeting" ON ad_campaign_targeting FOR SELECT TO anon USING (true);
