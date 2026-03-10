export interface SupportFaqCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  faqs?: SupportFaq[];
}

export interface SupportFaq {
  id: string;
  category_id: string | null;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  tags: string[];
  platform_area: string;
  target_audience: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: SupportFaqCategory;
}

export interface SupportTutorialGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  cover_image_url: string;
  platform_section: string;
  target_audience: string;
  target_platform: string;
  sort_order: number;
  is_active: boolean;
  tutorial_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  tutorials?: SupportTutorial[];
}

export interface SupportTutorial {
  id: string;
  group_id: string | null;
  title: string;
  description: string;
  youtube_video_id: string;
  youtube_url: string;
  thumbnail_url: string;
  duration_seconds: number;
  sort_order: number;
  is_published: boolean;
  view_count: number;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  platform_area: string;
  target_platform: string;
  tags: string[];
  transcript: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  group?: SupportTutorialGroup;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'bug' | 'feature_request' | 'account' | 'billing' | 'general' | 'how_to';
  reporter_user_id: string | null;
  reporter_name: string;
  reporter_email: string;
  reporter_club: string;
  assigned_to: string | null;
  assigned_to_name: string;
  platform_area: string;
  browser_info: string | null;
  screenshot_urls: string[];
  resolution_notes: string;
  resolved_at: string | null;
  closed_at: string | null;
  first_response_at: string | null;
  satisfaction_rating: number | null;
  satisfaction_comment: string | null;
  created_at: string;
  updated_at: string;
  messages?: SupportTicketMessage[];
  activity_log?: SupportTicketActivity[];
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_user_id: string | null;
  sender_name: string;
  sender_role: 'customer' | 'agent';
  message: string;
  attachment_urls: string[];
  is_internal_note: boolean;
  is_from_admin: boolean;
  created_at: string;
}

export interface SupportTicketActivity {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface SupportCannedResponse {
  id: string;
  title: string;
  content: string;
  category: string;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportAnalytics {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  waitingTickets: number;
  avgResolutionHours: number;
  avgFirstResponseHours: number;
  ticketsByCategory: Record<string, number>;
  ticketsByPriority: Record<string, number>;
  ticketsThisWeek: number;
  ticketsThisMonth: number;
  satisfactionAvg: number;
}

export const PLATFORM_AREAS = [
  { value: 'general', label: 'General' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'race_management', label: 'Race Management' },
  { value: 'membership', label: 'Membership' },
  { value: 'events', label: 'Events' },
  { value: 'website', label: 'Website Builder' },
  { value: 'finances', label: 'Finances' },
  { value: 'communications', label: 'Communications' },
  { value: 'media', label: 'Media & Content' },
  { value: 'alfie_tv', label: 'AlfieTV' },
  { value: 'live_tracking', label: 'Live Tracking' },
  { value: 'livestream', label: 'Livestream' },
  { value: 'start_box', label: 'Digital Start Box' },
  { value: 'community', label: 'Community' },
  { value: 'classifieds', label: 'Classifieds' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'my_garage', label: 'My Garage' },
  { value: 'mobile_app', label: 'Mobile App' },
  { value: 'settings', label: 'Settings' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'billing', label: 'Billing & Subscription' },
] as const;

export const TICKET_STATUSES = [
  { value: 'open', label: 'Open', color: 'bg-blue-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-500' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer', color: 'bg-orange-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-emerald-500' },
  { value: 'closed', label: 'Closed', color: 'bg-slate-500' },
] as const;

export const TICKET_PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-500' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-500' },
  { value: 'high', label: 'High', color: 'bg-amber-500' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
] as const;

export const TICKET_CATEGORIES = [
  { value: 'bug', label: 'Bug Report', icon: 'Bug' },
  { value: 'feature_request', label: 'Feature Request', icon: 'Lightbulb' },
  { value: 'account', label: 'Account Issue', icon: 'UserCircle' },
  { value: 'billing', label: 'Billing', icon: 'CreditCard' },
  { value: 'general', label: 'General Inquiry', icon: 'MessageCircle' },
  { value: 'how_to', label: 'How To', icon: 'HelpCircle' },
] as const;

export const DIFFICULTY_LEVELS = [
  { value: 'beginner', label: 'Beginner', color: 'bg-emerald-500' },
  { value: 'intermediate', label: 'Intermediate', color: 'bg-amber-500' },
  { value: 'advanced', label: 'Advanced', color: 'bg-red-500' },
] as const;
