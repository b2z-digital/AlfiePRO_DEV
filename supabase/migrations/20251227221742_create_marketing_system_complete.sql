/*
  # Email Marketing System - Complete
  
  Creates comprehensive email marketing with campaigns, automation flows, templates, and analytics.
  
  ## Tables
  - marketing_template_categories
  - marketing_email_templates
  - marketing_subscriber_lists
  - marketing_list_members
  - marketing_preferences
  - marketing_campaigns
  - marketing_campaign_content
  - marketing_recipients
  - marketing_events
  - marketing_automation_flows
  - marketing_flow_steps
  - marketing_flow_connections
  - marketing_flow_enrollments
  - marketing_flow_step_completions
*/

-- Template Categories
CREATE TABLE IF NOT EXISTS marketing_template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE marketing_template_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view categories" ON marketing_template_categories FOR SELECT USING (true);
CREATE POLICY "Super admins manage categories" ON marketing_template_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));

-- Email Templates
CREATE TABLE IF NOT EXISTS marketing_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES marketing_template_categories(id) ON DELETE SET NULL,
  thumbnail_url text,
  html_content text NOT NULL,
  json_structure jsonb,
  is_official boolean DEFAULT false,
  is_public boolean DEFAULT false,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES public.state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES public.national_associations(id) ON DELETE CASCADE,
  event_id uuid,
  created_by uuid REFERENCES auth.users(id),
  template_variables jsonb DEFAULT '[]'::jsonb,
  tags text[] DEFAULT ARRAY[]::text[],
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE marketing_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View public templates" ON marketing_email_templates FOR SELECT
  USING (is_public = true OR is_official = true);

CREATE POLICY "View org templates" ON marketing_email_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid() AND uc.club_id = marketing_email_templates.club_id
      AND uc.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins create templates" ON marketing_email_templates FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admins update templates" ON marketing_email_templates FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND club_id = marketing_email_templates.club_id AND role IN ('admin', 'super_admin')) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "Super admins delete templates" ON marketing_email_templates FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));

-- Subscriber Lists
CREATE TABLE IF NOT EXISTS marketing_subscriber_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES public.state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES public.national_associations(id) ON DELETE CASCADE,
  event_id uuid,
  list_type text DEFAULT 'custom',
  filter_criteria jsonb,
  subscriber_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE marketing_subscriber_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org lists" ON marketing_subscriber_lists FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND club_id = marketing_subscriber_lists.club_id));

CREATE POLICY "Admins manage lists" ON marketing_subscriber_lists FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND club_id = marketing_subscriber_lists.club_id AND role IN ('admin', 'super_admin')));

-- List Members
CREATE TABLE IF NOT EXISTS marketing_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid REFERENCES marketing_subscriber_lists(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'subscribed',
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz,
  source text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(list_id, email)
);

ALTER TABLE marketing_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View list members" ON marketing_list_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_subscriber_lists msl
    JOIN public.user_clubs uc ON uc.club_id = msl.club_id
    WHERE msl.id = marketing_list_members.list_id AND uc.user_id = auth.uid()
  ));

CREATE POLICY "Admins manage members" ON marketing_list_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM marketing_subscriber_lists msl
    JOIN public.user_clubs uc ON uc.club_id = msl.club_id
    WHERE msl.id = marketing_list_members.list_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

-- Preferences
CREATE TABLE IF NOT EXISTS marketing_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  unsubscribed_all boolean DEFAULT false,
  unsubscribed_marketing boolean DEFAULT false,
  unsubscribed_transactional boolean DEFAULT false,
  unsubscribed_lists uuid[] DEFAULT ARRAY[]::uuid[],
  preferences jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE marketing_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own preferences" ON marketing_preferences FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Update preferences" ON marketing_preferences FOR UPDATE USING (true);
CREATE POLICY "Insert preferences" ON marketing_preferences FOR INSERT WITH CHECK (true);

-- Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  preview_text text,
  from_name text NOT NULL,
  from_email text NOT NULL,
  reply_to text,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES public.state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES public.national_associations(id) ON DELETE CASCADE,
  event_id uuid,
  template_id uuid REFERENCES marketing_email_templates(id) ON DELETE SET NULL,
  list_ids uuid[] DEFAULT ARRAY[]::uuid[],
  segment_filter jsonb,
  status text DEFAULT 'draft',
  campaign_type text DEFAULT 'regular',
  send_at timestamptz,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  total_recipients integer DEFAULT 0,
  total_sent integer DEFAULT 0,
  total_delivered integer DEFAULT 0,
  total_opened integer DEFAULT 0,
  total_clicked integer DEFAULT 0,
  total_bounced integer DEFAULT 0,
  total_complained integer DEFAULT 0,
  total_unsubscribed integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_marketing_campaigns_club ON marketing_campaigns(club_id);
CREATE INDEX idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX idx_marketing_campaigns_created ON marketing_campaigns(created_at DESC);

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org campaigns" ON marketing_campaigns FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND club_id = marketing_campaigns.club_id));

CREATE POLICY "Admins manage campaigns" ON marketing_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND club_id = marketing_campaigns.club_id AND role IN ('admin', 'super_admin')));

-- Campaign Content
CREATE TABLE IF NOT EXISTS marketing_campaign_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE CASCADE NOT NULL UNIQUE,
  html_content text NOT NULL,
  plain_text text,
  json_structure jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE marketing_campaign_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View content" ON marketing_campaign_content FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_campaign_content.campaign_id AND uc.user_id = auth.uid()
  ));

CREATE POLICY "Admins manage content" ON marketing_campaign_content FOR ALL
  USING (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_campaign_content.campaign_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

-- Recipients
CREATE TABLE IF NOT EXISTS marketing_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  flow_enrollment_id uuid,
  flow_step_id uuid,
  email text NOT NULL,
  first_name text,
  last_name text,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  personalization_data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  first_clicked_at timestamptz,
  bounced_at timestamptz,
  bounce_reason text,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_marketing_recipients_campaign ON marketing_recipients(campaign_id);
CREATE INDEX idx_marketing_recipients_email ON marketing_recipients(email);

ALTER TABLE marketing_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view recipients" ON marketing_recipients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_recipients.campaign_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "System manages recipients" ON marketing_recipients FOR ALL USING (true);

-- Events
CREATE TABLE IF NOT EXISTS marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES marketing_recipients(id) ON DELETE CASCADE NOT NULL,
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb,
  ip_address text,
  user_agent text,
  location jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_marketing_events_recipient ON marketing_events(recipient_id);
CREATE INDEX idx_marketing_events_campaign ON marketing_events(campaign_id);
CREATE INDEX idx_marketing_events_type ON marketing_events(event_type);

ALTER TABLE marketing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Track events" ON marketing_events FOR INSERT WITH CHECK (true);
CREATE POLICY "View events" ON marketing_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_campaigns mc
    JOIN public.user_clubs uc ON uc.club_id = mc.club_id
    WHERE mc.id = marketing_events.campaign_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

-- Automation Flows
CREATE TABLE IF NOT EXISTS marketing_automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES public.state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES public.national_associations(id) ON DELETE CASCADE,
  event_id uuid,
  trigger_type text NOT NULL,
  trigger_config jsonb,
  status text DEFAULT 'draft',
  canvas_layout jsonb,
  created_by uuid REFERENCES auth.users(id),
  total_enrolled integer DEFAULT 0,
  currently_active integer DEFAULT 0,
  total_completed integer DEFAULT 0,
  activated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_marketing_flows_club ON marketing_automation_flows(club_id);
CREATE INDEX idx_marketing_flows_status ON marketing_automation_flows(status);

ALTER TABLE marketing_automation_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org flows" ON marketing_automation_flows FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND club_id = marketing_automation_flows.club_id));

CREATE POLICY "Admins manage flows" ON marketing_automation_flows FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_clubs WHERE user_id = auth.uid() AND club_id = marketing_automation_flows.club_id AND role IN ('admin', 'super_admin')));

-- Flow Steps
CREATE TABLE IF NOT EXISTS marketing_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES marketing_automation_flows(id) ON DELETE CASCADE NOT NULL,
  step_type text NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL,
  position jsonb,
  template_id uuid REFERENCES marketing_email_templates(id) ON DELETE SET NULL,
  subject text,
  email_content_html text,
  email_content_json jsonb,
  total_entered integer DEFAULT 0,
  total_completed integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_marketing_flow_steps_flow ON marketing_flow_steps(flow_id);

ALTER TABLE marketing_flow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View flow steps" ON marketing_flow_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_automation_flows maf
    JOIN public.user_clubs uc ON uc.club_id = maf.club_id
    WHERE maf.id = marketing_flow_steps.flow_id AND uc.user_id = auth.uid()
  ));

CREATE POLICY "Admins manage steps" ON marketing_flow_steps FOR ALL
  USING (EXISTS (
    SELECT 1 FROM marketing_automation_flows maf
    JOIN public.user_clubs uc ON uc.club_id = maf.club_id
    WHERE maf.id = marketing_flow_steps.flow_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

-- Flow Connections
CREATE TABLE IF NOT EXISTS marketing_flow_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES marketing_automation_flows(id) ON DELETE CASCADE NOT NULL,
  from_step_id uuid REFERENCES marketing_flow_steps(id) ON DELETE CASCADE,
  to_step_id uuid REFERENCES marketing_flow_steps(id) ON DELETE CASCADE NOT NULL,
  condition_type text,
  condition_config jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_marketing_flow_connections_flow ON marketing_flow_connections(flow_id);

ALTER TABLE marketing_flow_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View connections" ON marketing_flow_connections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_automation_flows maf
    JOIN public.user_clubs uc ON uc.club_id = maf.club_id
    WHERE maf.id = marketing_flow_connections.flow_id AND uc.user_id = auth.uid()
  ));

CREATE POLICY "Admins manage connections" ON marketing_flow_connections FOR ALL
  USING (EXISTS (
    SELECT 1 FROM marketing_automation_flows maf
    JOIN public.user_clubs uc ON uc.club_id = maf.club_id
    WHERE maf.id = marketing_flow_connections.flow_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

-- Flow Enrollments
CREATE TABLE IF NOT EXISTS marketing_flow_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES marketing_automation_flows(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step_id uuid REFERENCES marketing_flow_steps(id) ON DELETE SET NULL,
  status text DEFAULT 'active',
  enrollment_data jsonb DEFAULT '{}'::jsonb,
  enrolled_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  exited_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_marketing_flow_enrollments_flow ON marketing_flow_enrollments(flow_id);
CREATE INDEX idx_marketing_flow_enrollments_email ON marketing_flow_enrollments(email);

ALTER TABLE marketing_flow_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View enrollments" ON marketing_flow_enrollments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_automation_flows maf
    JOIN public.user_clubs uc ON uc.club_id = maf.club_id
    WHERE maf.id = marketing_flow_enrollments.flow_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "System manages enrollments" ON marketing_flow_enrollments FOR ALL USING (true);

-- Add FKs
ALTER TABLE marketing_recipients 
  ADD CONSTRAINT fk_marketing_flow_enrollment 
  FOREIGN KEY (flow_enrollment_id) 
  REFERENCES marketing_flow_enrollments(id) 
  ON DELETE CASCADE;

ALTER TABLE marketing_recipients 
  ADD CONSTRAINT fk_marketing_flow_step 
  FOREIGN KEY (flow_step_id) 
  REFERENCES marketing_flow_steps(id) 
  ON DELETE SET NULL;

-- Flow Completions
CREATE TABLE IF NOT EXISTS marketing_flow_step_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid REFERENCES marketing_flow_enrollments(id) ON DELETE CASCADE NOT NULL,
  step_id uuid REFERENCES marketing_flow_steps(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'completed',
  result_data jsonb,
  completed_at timestamptz DEFAULT now(),
  UNIQUE(enrollment_id, step_id)
);

CREATE INDEX idx_marketing_step_completions_enrollment ON marketing_flow_step_completions(enrollment_id);

ALTER TABLE marketing_flow_step_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View completions" ON marketing_flow_step_completions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM marketing_flow_enrollments mfe
    JOIN marketing_automation_flows maf ON maf.id = mfe.flow_id
    JOIN public.user_clubs uc ON uc.club_id = maf.club_id
    WHERE mfe.id = marketing_flow_step_completions.enrollment_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "System manages completions" ON marketing_flow_step_completions FOR ALL USING (true);

-- Indexes
CREATE INDEX idx_marketing_templates_club ON marketing_email_templates(club_id);
CREATE INDEX idx_marketing_templates_category ON marketing_email_templates(category_id);
CREATE INDEX idx_marketing_subscriber_lists_club ON marketing_subscriber_lists(club_id);
CREATE INDEX idx_marketing_list_members_list ON marketing_list_members(list_id);
CREATE INDEX idx_marketing_list_members_email ON marketing_list_members(email);

-- Insert Categories
INSERT INTO marketing_template_categories (name, description, icon, display_order) VALUES
  ('Event Promotion', 'Templates for promoting upcoming events', 'Calendar', 1),
  ('Event Reminders', 'Pre-event reminder templates', 'Bell', 2),
  ('Welcome Series', 'Welcome and onboarding emails', 'Mail', 3),
  ('Results & Recap', 'Post-event results and recaps', 'Trophy', 4),
  ('Newsletters', 'Regular club newsletters', 'Newspaper', 5),
  ('Membership', 'Membership renewals and updates', 'Users', 6),
  ('Announcements', 'General announcements', 'Megaphone', 7)
ON CONFLICT DO NOTHING;
