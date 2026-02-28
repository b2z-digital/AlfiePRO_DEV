export interface MarketingTemplateCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  created_at: string;
}

export interface MarketingEmailTemplate {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  thumbnail_url: string | null;
  html_content: string;
  json_structure: EmailBuilderStructure | null;
  is_official: boolean;
  is_public: boolean;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  event_id: string | null;
  created_by: string | null;
  template_variables: TemplateVariable[];
  tags: string[];
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  default_value?: string;
}

export interface EmailBuilderStructure {
  rows: EmailBuilderRow[];
  globalStyles?: {
    backgroundColor?: string;
    fontFamily?: string;
    textColor?: string;
  };
}

export interface EmailBuilderRow {
  id: string;
  columns: EmailBuilderColumn[];
  backgroundColor?: string;
  padding?: string;
}

export interface EmailBuilderColumn {
  id: string;
  width: number; // Percentage
  widgets: EmailWidget[];
}

export interface EmailWidget {
  id: string;
  type: 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'social' | 'event_details' | 'registration_cta';
  config: Record<string, any>;
}

export interface MarketingSubscriberList {
  id: string;
  name: string;
  description: string | null;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  event_id: string | null;
  list_type: 'custom' | 'all_members' | 'auto_members' | 'auto_registrants' | 'auto_class';
  filter_criteria: Record<string, any> | null;
  total_contacts: number;
  active_subscriber_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingListMember {
  id: string;
  list_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  member_id: string | null;
  user_id: string | null;
  custom_fields: Record<string, any>;
  status: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained';
  subscribed_at: string;
  unsubscribed_at: string | null;
  source: string | null;
  created_at: string;
}

export interface MarketingPreferences {
  id: string;
  email: string;
  user_id: string | null;
  unsubscribed_all: boolean;
  unsubscribed_marketing: boolean;
  unsubscribed_transactional: boolean;
  unsubscribed_lists: string[];
  preferences: Record<string, any>;
  updated_at: string;
  created_at: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  event_id: string | null;
  template_id: string | null;
  list_ids: string[];
  segment_filter: Record<string, any> | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  campaign_type: 'regular' | 'ab_test' | 'automated';
  send_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  total_recipients: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_complained: number;
  total_unsubscribed: number;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaignContent {
  id: string;
  campaign_id: string;
  html_content: string;
  plain_text: string | null;
  json_structure: EmailBuilderStructure | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingRecipient {
  id: string;
  campaign_id: string | null;
  flow_enrollment_id: string | null;
  flow_step_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  member_id: string | null;
  user_id: string | null;
  personalization_data: Record<string, any>;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained';
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
}

export interface MarketingEvent {
  id: string;
  recipient_id: string;
  campaign_id: string | null;
  event_type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed';
  event_data: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  location: Record<string, any> | null;
  created_at: string;
}

export interface MarketingAutomationFlow {
  id: string;
  name: string;
  description: string | null;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  event_id: string | null;
  trigger_type: 'event_registration' | 'time_based' | 'form_submission' | 'manual' | 'membership_renewal' | 'event_published';
  trigger_config: Record<string, any> | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  canvas_layout: CanvasLayout | null;
  created_by: string | null;
  total_enrolled: number;
  currently_active: number;
  total_completed: number;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasLayout {
  nodes: FlowNode[];
  zoom: number;
  pan: { x: number; y: number };
}

export interface FlowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay';
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface MarketingFlowStep {
  id: string;
  flow_id: string;
  step_type: 'send_email' | 'wait' | 'condition' | 'conditional_split' | 'add_to_list' | 'remove_from_list' | 'webhook' | 'split_ab';
  name: string;
  config: Record<string, any>;
  position: { x: number; y: number } | null;
  template_id: string | null;
  subject: string | null;
  preview_text: string | null;
  sender_name: string | null;
  sender_email: string | null;
  email_content_html: string | null;
  email_content_json: EmailBuilderStructure | null;
  total_entered: number;
  total_completed: number;
  created_at: string;
  updated_at: string;
}

export interface MarketingFlowConnection {
  id: string;
  flow_id: string;
  from_step_id: string | null;
  to_step_id: string;
  condition_type: 'yes' | 'no' | 'a' | 'b' | null;
  condition_config: Record<string, any> | null;
  created_at: string;
}

export interface MarketingFlowEnrollment {
  id: string;
  flow_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  member_id: string | null;
  user_id: string | null;
  current_step_id: string | null;
  status: 'active' | 'completed' | 'exited' | 'paused';
  enrollment_data: Record<string, any>;
  enrolled_at: string;
  completed_at: string | null;
  exited_at: string | null;
  created_at: string;
}

export interface MarketingFlowStepCompletion {
  id: string;
  enrollment_id: string;
  step_id: string;
  status: 'completed' | 'skipped' | 'failed';
  result_data: Record<string, any> | null;
  completed_at: string;
}

export interface CampaignAnalytics {
  campaign_id: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  unsubscribe_rate: number;
  click_to_open_rate: number;
}

export interface MarketingEmailTemplate {
  id: string;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  category: string;
  email_content_json: EmailBuilderStructure | null;
  email_content_html: string | null;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowAnalytics {
  flow_id: string;
  enrolled: number;
  active: number;
  completed: number;
  completion_rate: number;
  average_completion_time: number;
  step_performance: StepPerformance[];
}

export interface StepPerformance {
  step_id: string;
  step_name: string;
  entered: number;
  completed: number;
  completion_rate: number;
  drop_off_rate: number;
}

export interface MarketingOverviewStats {
  total_campaigns: number;
  active_flows: number;
  total_subscribers: number;
  recent_campaigns: MarketingCampaign[];
  recent_flows: MarketingAutomationFlow[];
  period_stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    avg_open_rate: number;
    avg_click_rate: number;
  };
}
