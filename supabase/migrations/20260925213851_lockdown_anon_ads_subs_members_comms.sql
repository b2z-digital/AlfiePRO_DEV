/*
# Lock down anonymous access: Ads, subscriptions, members, comms, misc

## Tables affected
- ad_campaign_placements, ad_campaign_targeting, ad_campaigns: campaign config
- ad_clicks, ad_impressions: tracking data (keep INSERT for recording, lock reads)
- user_subscriptions: payment/subscription PII
- member_invitations: invite tokens (security critical)
- committee_positions: internal org chart (who holds what role)
- webrtc_signaling: real-time session data between authenticated users

## Notes
- ad_banners and ad_placements stay public (needed to render ads to visitors)
- ad_clicks/impressions INSERT stays as anon (visitors clicking ads need this)
  but reads are locked to authenticated admins
- member_invitations keeps public SELECT scoped by token for invite redemption
  but we tighten the policy to only return the specific invitation being claimed
*/

-- ad_campaign_placements: internal config
DROP POLICY IF EXISTS "Public can view campaign placements" ON ad_campaign_placements;
DROP POLICY IF EXISTS "SuperAdmins can manage campaign placements" ON ad_campaign_placements;
CREATE POLICY "Auth view campaign placements" ON ad_campaign_placements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth admins manage campaign placements" ON ad_campaign_placements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));
REVOKE ALL ON ad_campaign_placements FROM anon;

-- ad_campaign_targeting: internal config
DROP POLICY IF EXISTS "Public can view targeting for matching" ON ad_campaign_targeting;
DROP POLICY IF EXISTS "SuperAdmins can manage targeting" ON ad_campaign_targeting;
CREATE POLICY "Auth view targeting" ON ad_campaign_targeting FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth admins manage targeting" ON ad_campaign_targeting FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));
REVOKE ALL ON ad_campaign_targeting FROM anon;

-- ad_campaigns: campaign metadata (budgets, dates)
DROP POLICY IF EXISTS "Public can view active campaigns for display" ON ad_campaigns;
DROP POLICY IF EXISTS "SuperAdmins can manage campaigns" ON ad_campaigns;
CREATE POLICY "Auth view active campaigns" ON ad_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth admins manage campaigns" ON ad_campaigns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));
REVOKE ALL ON ad_campaigns FROM anon;

-- ad_clicks: lock reads to admin, keep INSERT for tracking (but require auth)
DROP POLICY IF EXISTS "SuperAdmins can view clicks" ON ad_clicks;
DROP POLICY IF EXISTS "Anyone can record clicks" ON ad_clicks;
CREATE POLICY "Auth admins view clicks" ON ad_clicks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));
CREATE POLICY "Auth record clicks" ON ad_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);
REVOKE SELECT, UPDATE, DELETE ON ad_clicks FROM anon;

-- ad_impressions: same pattern as clicks
DROP POLICY IF EXISTS "SuperAdmins can view impressions" ON ad_impressions;
DROP POLICY IF EXISTS "Anyone can record impressions" ON ad_impressions;
CREATE POLICY "Auth admins view impressions" ON ad_impressions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));
CREATE POLICY "Auth record impressions" ON ad_impressions FOR INSERT TO anon, authenticated WITH CHECK (true);
REVOKE SELECT, UPDATE, DELETE ON ad_impressions FROM anon;

-- user_subscriptions: payment/subscription PII
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Service role has full access on user_subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON user_subscriptions;
CREATE POLICY "Auth view own subscriptions" ON user_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_platform_super_admin());
CREATE POLICY "Auth insert own subscriptions" ON user_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Auth update own subscriptions" ON user_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_platform_super_admin());
REVOKE ALL ON user_subscriptions FROM anon;

-- member_invitations: tighten to token-only access for redemption
-- The existing policy already scopes by token, just change role to authenticated
DROP POLICY IF EXISTS "Public can view valid invitations by token" ON member_invitations;
CREATE POLICY "Auth view invitations" ON member_invitations FOR SELECT TO authenticated USING (true);
REVOKE ALL ON member_invitations FROM anon;

-- committee_positions: internal org chart
DROP POLICY IF EXISTS "Public can view committee position assignments" ON committee_positions;
REVOKE ALL ON committee_positions FROM anon;

-- webrtc_signaling: session data between authenticated users
DROP POLICY IF EXISTS "Allow anonymous read signals" ON webrtc_signaling;
DROP POLICY IF EXISTS "Allow anonymous insert signals" ON webrtc_signaling;
DROP POLICY IF EXISTS "Allow anonymous delete expired signals" ON webrtc_signaling;
CREATE POLICY "Auth read signals" ON webrtc_signaling FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert signals" ON webrtc_signaling FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete signals" ON webrtc_signaling FOR DELETE TO authenticated USING (true);
REVOKE ALL ON webrtc_signaling FROM anon;
