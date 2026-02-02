export interface EventTaskBoard {
  id: string;
  event_id: string | null;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  name: string;
  description: string | null;
  board_type: 'event' | 'template' | 'project';
  is_template: boolean;
  template_category: 'championship' | 'regatta' | 'social' | 'training' | 'other' | null;
  settings: BoardSettings;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardSettings {
  show_effort_tracking?: boolean;
  show_dependencies?: boolean;
  auto_archive_completed?: boolean;
  notification_preferences?: {
    task_assigned?: boolean;
    task_completed?: boolean;
    task_overdue?: boolean;
  };
}

export interface EventTaskLane {
  id: string;
  board_id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  wip_limit: number | null;
  is_default: boolean;
  lane_type: 'backlog' | 'planning' | 'in_progress' | 'review' | 'completed' | 'custom';
  created_at: string;
  updated_at: string;
}

export interface EnhancedTask {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee_id: string | null;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;

  // Event Command Center fields
  event_id: string | null;
  board_id: string | null;
  lane_id: string | null;
  position: number;
  estimated_hours: number | null;
  actual_hours: number | null;
  blocked_reason: string | null;
  is_milestone: boolean;
  tags: string[];

  // Relationships
  assignee?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  dependencies?: TaskDependency[];
  dependents?: TaskDependency[];
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
  lag_days: number;
  created_at: string;
  depends_on_task?: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
  };
}

export interface EventTeamChannel {
  id: string;
  event_id: string;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  name: string;
  description: string | null;
  channel_type: 'general' | 'logistics' | 'marketing' | 'race_management' | 'social' | 'custom';
  is_private: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  unread_count?: number;
  members?: ChannelMember[];
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  is_muted: boolean;
  last_read_at: string | null;
  joined_at: string;
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface EventChannelMessage {
  id: string;
  channel_id: string;
  user_id: string;
  message: string;
  mentions: string[];
  attachments: MessageAttachment[];
  thread_id: string | null;
  reactions: MessageReaction[];
  is_edited: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  reply_count?: number;
}

export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface MessageReaction {
  emoji: string;
  user_ids: string[];
  count: number;
}

export interface EventActivity {
  id: string;
  event_id: string;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  user_id: string | null;
  activity_type:
    | 'task_created'
    | 'task_updated'
    | 'task_completed'
    | 'task_assigned'
    | 'message_sent'
    | 'file_uploaded'
    | 'registration_received'
    | 'website_updated'
    | 'document_generated'
    | 'deadline_approaching'
    | 'milestone_reached'
    | 'automation_triggered'
    | 'other';
  entity_type: 'task' | 'message' | 'file' | 'registration' | 'website' | 'document' | 'other' | null;
  entity_id: string | null;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
  user?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface EventTaskTemplate {
  id: string;
  name: string;
  description: string | null;
  event_type: 'championship' | 'regatta' | 'social' | 'training' | 'meeting' | 'other' | null;
  event_duration_days: number | null;
  tasks: TemplateTask[];
  default_lanes: TemplateLane[];
  is_public: boolean;
  created_by: string | null;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateTask {
  title: string;
  description: string;
  lane_type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  days_before_event: number;
  estimated_hours: number | null;
  assignee_role: string | null;
  tags: string[];
  is_milestone: boolean;
  dependencies: number[];
}

export interface TemplateLane {
  name: string;
  description: string;
  color: string;
  position: number;
  lane_type: string;
}

export interface AutomationRule {
  id: string;
  board_id: string;
  name: string;
  description: string | null;
  trigger_type:
    | 'task_overdue'
    | 'task_due_soon'
    | 'lane_changed'
    | 'task_assigned'
    | 'task_completed'
    | 'wip_limit_reached'
    | 'dependency_blocked'
    | 'time_based'
    | 'manual';
  trigger_conditions: Record<string, any>;
  action_type:
    | 'send_notification'
    | 'send_email'
    | 'assign_user'
    | 'move_lane'
    | 'update_priority'
    | 'add_comment'
    | 'create_task'
    | 'escalate';
  action_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  updated_at: string;
  user?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  created_at: string;
}

export interface BoardView {
  type: 'board' | 'timeline' | 'list' | 'activity' | 'dashboard';
  filters?: {
    assignee?: string[];
    priority?: string[];
    tags?: string[];
    search?: string;
  };
  sort?: {
    field: 'due_date' | 'priority' | 'created_at' | 'title';
    direction: 'asc' | 'desc';
  };
}

export interface TaskMoveEvent {
  taskId: string;
  sourceLaneId: string;
  targetLaneId: string;
  sourcePosition: number;
  targetPosition: number;
}

export interface DragItem {
  type: 'task';
  task: EnhancedTask;
  sourceLaneId: string;
}

// Monday.com-style Table Board Types
export interface TaskGroup {
  id: string;
  board_id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  is_collapsed: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  name: string;
  column_type: 'status' | 'text' | 'person' | 'date' | 'number' | 'dropdown' | 'checkbox' | 'timeline' | 'files' | 'priority';
  position: number;
  width: number;
  settings: ColumnSettings;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface ColumnSettings {
  // Status column settings
  status_options?: StatusOption[];

  // Dropdown column settings
  dropdown_options?: DropdownOption[];

  // Number column settings
  number_format?: 'number' | 'currency' | 'percentage';
  currency_symbol?: string;
  decimal_places?: number;

  // Date column settings
  include_time?: boolean;

  // Timeline column settings
  show_weekends?: boolean;
}

export interface StatusOption {
  id: string;
  label: string;
  color: string;
}

export interface DropdownOption {
  id: string;
  label: string;
  color?: string;
}

export interface TaskColumnData {
  id: string;
  task_id: string;
  column_id: string;
  value: any;
  created_at: string;
  updated_at: string;
}
