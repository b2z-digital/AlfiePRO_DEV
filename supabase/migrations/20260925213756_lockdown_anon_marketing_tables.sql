/*
# Lock down anonymous access: Marketing system (16 tables)

All marketing tables switched from public/anon to authenticated-only.
These contain campaign strategies, contact lists, tracking events, and 
email templates that should never be publicly accessible.
*/

-- marketing_automation_flows
DROP POLICY IF EXISTS "View org flows" ON marketing_automation_flows;
DROP POLICY IF EXISTS "Admins manage flows" ON marketing_automation_flows;
CREATE POLICY "Auth view flows" ON marketing_automation_flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage flows" ON marketing_automation_flows FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_automation_flows FROM anon;

-- marketing_automation_job_runs
DROP POLICY IF EXISTS "Super admins view job runs" ON marketing_automation_job_runs;
DROP POLICY IF EXISTS "System creates job runs" ON marketing_automation_job_runs;
DROP POLICY IF EXISTS "System updates job runs" ON marketing_automation_job_runs;
CREATE POLICY "Auth view job runs" ON marketing_automation_job_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert job runs" ON marketing_automation_job_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update job runs" ON marketing_automation_job_runs FOR UPDATE TO authenticated USING (true);
REVOKE ALL ON marketing_automation_job_runs FROM anon;

-- marketing_campaign_content
DROP POLICY IF EXISTS "View content" ON marketing_campaign_content;
DROP POLICY IF EXISTS "Admins create content" ON marketing_campaign_content;
DROP POLICY IF EXISTS "Admins update content" ON marketing_campaign_content;
DROP POLICY IF EXISTS "Admins delete content" ON marketing_campaign_content;
CREATE POLICY "Auth view content" ON marketing_campaign_content FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert content" ON marketing_campaign_content FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update content" ON marketing_campaign_content FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete content" ON marketing_campaign_content FOR DELETE TO authenticated USING (true);
REVOKE ALL ON marketing_campaign_content FROM anon;

-- marketing_campaigns
DROP POLICY IF EXISTS "View org campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Admins create campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Admins update campaigns" ON marketing_campaigns;
DROP POLICY IF EXISTS "Admins delete campaigns" ON marketing_campaigns;
CREATE POLICY "Auth view campaigns" ON marketing_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert campaigns" ON marketing_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update campaigns" ON marketing_campaigns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete campaigns" ON marketing_campaigns FOR DELETE TO authenticated USING (true);
REVOKE ALL ON marketing_campaigns FROM anon;

-- marketing_email_templates
DROP POLICY IF EXISTS "View org templates" ON marketing_email_templates;
DROP POLICY IF EXISTS "View public templates" ON marketing_email_templates;
DROP POLICY IF EXISTS "Admins create templates" ON marketing_email_templates;
DROP POLICY IF EXISTS "Admins update templates" ON marketing_email_templates;
DROP POLICY IF EXISTS "Super admins delete templates" ON marketing_email_templates;
CREATE POLICY "Auth view templates" ON marketing_email_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert templates" ON marketing_email_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update templates" ON marketing_email_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete templates" ON marketing_email_templates FOR DELETE TO authenticated USING (true);
REVOKE ALL ON marketing_email_templates FROM anon;

-- marketing_events
DROP POLICY IF EXISTS "View events" ON marketing_events;
DROP POLICY IF EXISTS "Track events" ON marketing_events;
CREATE POLICY "Auth view events" ON marketing_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert events" ON marketing_events FOR INSERT TO authenticated WITH CHECK (true);
REVOKE ALL ON marketing_events FROM anon;

-- marketing_flow_connections
DROP POLICY IF EXISTS "View connections" ON marketing_flow_connections;
DROP POLICY IF EXISTS "Admins manage connections" ON marketing_flow_connections;
CREATE POLICY "Auth view connections" ON marketing_flow_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage connections" ON marketing_flow_connections FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_flow_connections FROM anon;

-- marketing_flow_enrollments
DROP POLICY IF EXISTS "View enrollments" ON marketing_flow_enrollments;
DROP POLICY IF EXISTS "System manages enrollments" ON marketing_flow_enrollments;
CREATE POLICY "Auth view enrollments" ON marketing_flow_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage enrollments" ON marketing_flow_enrollments FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_flow_enrollments FROM anon;

-- marketing_flow_step_completions
DROP POLICY IF EXISTS "View completions" ON marketing_flow_step_completions;
DROP POLICY IF EXISTS "System manages completions" ON marketing_flow_step_completions;
CREATE POLICY "Auth view completions" ON marketing_flow_step_completions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage completions" ON marketing_flow_step_completions FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_flow_step_completions FROM anon;

-- marketing_flow_steps
DROP POLICY IF EXISTS "View flow steps" ON marketing_flow_steps;
DROP POLICY IF EXISTS "Admins manage steps" ON marketing_flow_steps;
CREATE POLICY "Auth view steps" ON marketing_flow_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage steps" ON marketing_flow_steps FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_flow_steps FROM anon;

-- marketing_list_members
DROP POLICY IF EXISTS "View list members" ON marketing_list_members;
DROP POLICY IF EXISTS "Admins manage members" ON marketing_list_members;
CREATE POLICY "Auth view list members" ON marketing_list_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage list members" ON marketing_list_members FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_list_members FROM anon;

-- marketing_preferences
DROP POLICY IF EXISTS "View own preferences" ON marketing_preferences;
DROP POLICY IF EXISTS "Insert preferences" ON marketing_preferences;
DROP POLICY IF EXISTS "Update preferences" ON marketing_preferences;
CREATE POLICY "Auth view own preferences" ON marketing_preferences FOR SELECT TO authenticated USING (email = (auth.jwt() ->> 'email'));
CREATE POLICY "Auth insert preferences" ON marketing_preferences FOR INSERT TO authenticated WITH CHECK (email = (auth.jwt() ->> 'email'));
CREATE POLICY "Auth update preferences" ON marketing_preferences FOR UPDATE TO authenticated USING (email = (auth.jwt() ->> 'email'));
REVOKE ALL ON marketing_preferences FROM anon;

-- marketing_recipients
DROP POLICY IF EXISTS "Admins view recipients" ON marketing_recipients;
DROP POLICY IF EXISTS "System manages recipients" ON marketing_recipients;
CREATE POLICY "Auth view recipients" ON marketing_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage recipients" ON marketing_recipients FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_recipients FROM anon;

-- marketing_subscriber_lists
DROP POLICY IF EXISTS "View org lists" ON marketing_subscriber_lists;
DROP POLICY IF EXISTS "Admins manage lists" ON marketing_subscriber_lists;
CREATE POLICY "Auth view lists" ON marketing_subscriber_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage lists" ON marketing_subscriber_lists FOR ALL TO authenticated USING (true);
REVOKE ALL ON marketing_subscriber_lists FROM anon;

-- marketing_template_categories
DROP POLICY IF EXISTS "Anyone can view categories" ON marketing_template_categories;
DROP POLICY IF EXISTS "Super admins manage categories" ON marketing_template_categories;
CREATE POLICY "Auth view categories" ON marketing_template_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage categories" ON marketing_template_categories FOR ALL TO authenticated USING (is_platform_super_admin());
REVOKE ALL ON marketing_template_categories FROM anon;
