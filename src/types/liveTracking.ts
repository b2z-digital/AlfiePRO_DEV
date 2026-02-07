export interface LiveTrackingSession {
  id: string;
  event_id: string;
  member_id: string | null;
  selected_skipper_name: string | null;
  selected_sail_number: string | null;
  device_fingerprint: string | null;
  push_subscription: PushSubscriptionData | null;
  created_at: string;
  last_active_at: string;
  expires_at: string | null;
  is_expired: boolean;
  notification_preferences: NotificationPreferences;
}

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPreferences {
  urgent: boolean;
  important: boolean;
  info: boolean;
  low: boolean;
  sound: boolean;
  vibrate: boolean;
}

export interface SessionSkipperTracking {
  id: string;
  session_id: string;
  event_id: string;
  skipper_name: string;
  sail_number: string;
  boat_class: string | null;

  // Heat racing
  current_heat_id: string | null;
  current_heat_name: string | null;
  current_round: number | null;

  // All formats
  current_position: number | null;
  total_points: number | null;
  races_completed: number;

  // Handicap racing
  current_handicap: number | null;
  corrected_time_total: number | null;

  // Scratch racing
  scratch_position: number | null;

  // Status
  last_race_result: string | null;
  promotion_status: 'promoted' | 'relegated' | 'maintained' | null;

  updated_at: string;
}

export interface SkipperNotification {
  id: string;
  session_id: string;
  notification_type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data: Record<string, any>;
  sent_at: string;
  delivered: boolean;
  opened_at: string | null;
  clicked: boolean;
  error_message: string | null;
  retry_count: number;
}

export type NotificationType =
  | 'heat_assignment'
  | 'race_starting'
  | 'results_published'
  | 'handicap_update'
  | 'position_update'
  | 'promotion'
  | 'relegation'
  | 'race_countdown';

export type NotificationPriority = 'urgent' | 'important' | 'info' | 'low';

export interface LiveTrackingEvent {
  id: string;
  event_id: string;
  club_id: string | null;
  state_association_id?: string | null;
  national_association_id?: string | null;
  access_token: string;
  short_code: string | null;
  enabled: boolean;
  qr_code_url: string | null;
  public_url: string | null;
  active_sessions_count: number;
  total_sessions_created: number;
  total_notifications_sent: number;
  notification_settings: NotificationSettings;
  created_at: string;
  updated_at: string;
}

export interface NotificationSettings {
  enable_race_starting: boolean;
  enable_results_published: boolean;
  enable_heat_assignments: boolean;
  enable_handicap_updates: boolean;
  enable_position_updates: boolean;
  warning_minutes_before_race: number[];
  auto_notify_on_promotion: boolean;
  auto_notify_on_relegation: boolean;
}

export interface SkipperDashboardData {
  skipper: {
    name: string;
    sail_number: string;
    boat_class: string | null;
    avatar_url?: string | null;
    current_heat?: string | null;
    current_round?: number | null;
  };
  event: {
    id: string;
    name: string;
    date: string;
    venue: string;
    race_format: 'handicap' | 'scratch';
    type: 'one-off' | 'series' | 'heat';
  };
  current_status: {
    // Position
    position: number | null;
    total_points: number | null;
    races_completed: number;

    // Handicap
    current_handicap?: number;
    corrected_time_total?: number;

    // Status
    promotion_status?: 'promoted' | 'relegated' | 'maintained' | null;
    last_race_result?: string;
  };
  upcoming_race: {
    round_number: number | null;
    heat_name: string | null;
    competitors: Array<{
      name: string;
      sail_number: string;
      current_position?: number;
    }>;
    start_time_estimate?: string;
  } | null;
  standings: Array<{
    position: number;
    name: string;
    sail_number: string;
    points: number;
    races_completed: number;
    is_current_user: boolean;
    avatar_url?: string | null;
  }>;
  heat_standings?: Array<{
    heat_name: string;
    skippers: Array<{
      name: string;
      sail_number: string;
      position: number;
    }>;
  }>;
}

export interface LiveTrackingQRCodeData {
  event_id: string;
  access_token: string;
  event_name: string;
  club_name: string;
  date: string;
  url: string;
}
