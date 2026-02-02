/*
  # Event Command Center System - Phase 1: Database Schema
  
  This migration creates a comprehensive event task management system with:
  - Event task boards with customizable lanes (Kanban columns)
  - Task dependencies and critical path tracking
  - Event team channels for real-time collaboration
  - Activity feed for event-related actions
  - Task templates and automation rules
  
  ## New Tables
  
  ### `event_task_boards`
  Stores board configurations for each event
  - `id` (uuid, primary key)
  - `event_id` (uuid, references public_events) - can be null for templates
  - `club_id` (uuid, references clubs)
  - `name` (text) - board name
  - `description` (text)
  - `board_type` (text) - 'event', 'template', 'project'
  - `is_template` (boolean)
  - `template_category` (text) - 'championship', 'regatta', 'social', 'training'
  - `settings` (jsonb) - board settings
  - `created_at`, `updated_at`
  
  ### `event_task_lanes`
  Customizable columns for Kanban boards
  - `id` (uuid, primary key)
  - `board_id` (uuid, references event_task_boards)
  - `name` (text) - lane name
  - `description` (text)
  - `color` (text) - hex color
  - `position` (integer) - display order
  - `wip_limit` (integer) - work in progress limit
  - `is_default` (boolean) - default lanes (Planning, In Progress, etc.)
  - `created_at`, `updated_at`
  
  ### `event_task_dependencies`
  Task dependencies for critical path
  - `id` (uuid, primary key)
  - `task_id` (uuid, references club_tasks)
  - `depends_on_task_id` (uuid, references club_tasks)
  - `dependency_type` (text) - 'finish_to_start', 'start_to_start', 'finish_to_finish'
  - `lag_days` (integer) - optional delay
  - `created_at`
  
  ### `event_team_channels`
  Team communication channels per event
  - `id` (uuid, primary key)
  - `event_id` (uuid, references public_events)
  - `club_id` (uuid)
  - `name` (text)
  - `description` (text)
  - `channel_type` (text) - 'general', 'logistics', 'marketing', 'race_management'
  - `is_private` (boolean)
  - `created_by` (uuid, references auth.users)
  - `created_at`, `updated_at`
  
  ### `event_channel_messages`
  Messages within event channels
  - `id` (uuid, primary key)
  - `channel_id` (uuid, references event_team_channels)
  - `user_id` (uuid, references auth.users)
  - `message` (text)
  - `mentions` (text[]) - array of user IDs
  - `attachments` (jsonb)
  - `thread_id` (uuid) - for threading
  - `reactions` (jsonb)
  - `is_edited` (boolean)
  - `created_at`, `updated_at`
  
  ### `event_activity_feed`
  Comprehensive activity tracking
  - `id` (uuid, primary key)
  - `event_id` (uuid, references public_events)
  - `club_id` (uuid)
  - `user_id` (uuid, references auth.users)
  - `activity_type` (text) - 'task_created', 'task_completed', 'message_sent', etc.
  - `entity_type` (text) - 'task', 'message', 'file', 'registration'
  - `entity_id` (uuid)
  - `title` (text)
  - `description` (text)
  - `metadata` (jsonb)
  - `created_at`
  
  ### `event_task_templates`
  Pre-built task templates for events
  - `id` (uuid, primary key)
  - `name` (text)
  - `description` (text)
  - `event_type` (text) - 'championship', 'regatta', 'social'
  - `event_duration_days` (integer)
  - `tasks` (jsonb) - array of task definitions
  - `is_public` (boolean)
  - `created_by` (uuid)
  - `created_at`, `updated_at`
  
  ### `event_automation_rules`
  Automation rules for task management
  - `id` (uuid, primary key)
  - `board_id` (uuid, references event_task_boards)
  - `name` (text)
  - `trigger_type` (text) - 'task_overdue', 'lane_changed', 'task_assigned'
  - `trigger_conditions` (jsonb)
  - `action_type` (text) - 'send_notification', 'assign_user', 'move_lane'
  - `action_config` (jsonb)
  - `is_active` (boolean)
  - `created_at`, `updated_at`
  
  ## Table Modifications
  
  ### Enhance `club_tasks`
  - Add `event_id` (uuid) - link to public_events
  - Add `board_id` (uuid) - link to event_task_boards
  - Add `lane_id` (uuid) - current lane
  - Add `position` (integer) - position in lane
  - Add `estimated_hours` (numeric) - time estimate
  - Add `actual_hours` (numeric) - actual time
  - Add `blocked_reason` (text)
  - Add `is_milestone` (boolean)
  - Add `tags` (text[]) - task tags
  
  ## Security
  - Enable RLS on all tables
  - Users can access boards/tasks for their clubs/associations
  - Event organizers have full access
  - Team members have read/write access to their channels
*/

-- Enhance club_tasks table first
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'event_id') THEN
    ALTER TABLE club_tasks ADD COLUMN event_id uuid REFERENCES public_events(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'board_id') THEN
    ALTER TABLE club_tasks ADD COLUMN board_id uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'lane_id') THEN
    ALTER TABLE club_tasks ADD COLUMN lane_id uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'position') THEN
    ALTER TABLE club_tasks ADD COLUMN position integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'estimated_hours') THEN
    ALTER TABLE club_tasks ADD COLUMN estimated_hours numeric(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'actual_hours') THEN
    ALTER TABLE club_tasks ADD COLUMN actual_hours numeric(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'blocked_reason') THEN
    ALTER TABLE club_tasks ADD COLUMN blocked_reason text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'is_milestone') THEN
    ALTER TABLE club_tasks ADD COLUMN is_milestone boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_tasks' AND column_name = 'tags') THEN
    ALTER TABLE club_tasks ADD COLUMN tags text[];
  END IF;
END $$;

-- Create event_task_boards table
CREATE TABLE IF NOT EXISTS event_task_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public_events(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  board_type text DEFAULT 'event' CHECK (board_type IN ('event', 'template', 'project')),
  is_template boolean DEFAULT false,
  template_category text CHECK (template_category IN ('championship', 'regatta', 'social', 'training', 'other')),
  settings jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create event_task_lanes table
CREATE TABLE IF NOT EXISTS event_task_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES event_task_boards(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6366f1',
  position integer NOT NULL DEFAULT 0,
  wip_limit integer,
  is_default boolean DEFAULT false,
  lane_type text DEFAULT 'custom' CHECK (lane_type IN ('backlog', 'planning', 'in_progress', 'review', 'completed', 'custom')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(board_id, position)
);

-- Add foreign key to club_tasks now that lanes table exists
ALTER TABLE club_tasks DROP CONSTRAINT IF EXISTS club_tasks_board_id_fkey;
ALTER TABLE club_tasks ADD CONSTRAINT club_tasks_board_id_fkey 
  FOREIGN KEY (board_id) REFERENCES event_task_boards(id) ON DELETE SET NULL;

ALTER TABLE club_tasks DROP CONSTRAINT IF EXISTS club_tasks_lane_id_fkey;
ALTER TABLE club_tasks ADD CONSTRAINT club_tasks_lane_id_fkey 
  FOREIGN KEY (lane_id) REFERENCES event_task_lanes(id) ON DELETE SET NULL;

-- Create event_task_dependencies table
CREATE TABLE IF NOT EXISTS event_task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES club_tasks(id) ON DELETE CASCADE NOT NULL,
  depends_on_task_id uuid REFERENCES club_tasks(id) ON DELETE CASCADE NOT NULL,
  dependency_type text DEFAULT 'finish_to_start' CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  lag_days integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id),
  CHECK (task_id != depends_on_task_id)
);

-- Create event_team_channels table
CREATE TABLE IF NOT EXISTS event_team_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public_events(id) ON DELETE CASCADE NOT NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel_type text DEFAULT 'general' CHECK (channel_type IN ('general', 'logistics', 'marketing', 'race_management', 'social', 'custom')),
  is_private boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create event_channel_messages table
CREATE TABLE IF NOT EXISTS event_channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES event_team_channels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  message text NOT NULL,
  mentions text[] DEFAULT ARRAY[]::text[],
  attachments jsonb DEFAULT '[]'::jsonb,
  thread_id uuid REFERENCES event_channel_messages(id) ON DELETE CASCADE,
  reactions jsonb DEFAULT '[]'::jsonb,
  is_edited boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create event_activity_feed table
CREATE TABLE IF NOT EXISTS event_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public_events(id) ON DELETE CASCADE NOT NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN (
    'task_created', 'task_updated', 'task_completed', 'task_assigned', 
    'message_sent', 'file_uploaded', 'registration_received', 
    'website_updated', 'document_generated', 'deadline_approaching',
    'milestone_reached', 'automation_triggered', 'other'
  )),
  entity_type text CHECK (entity_type IN ('task', 'message', 'file', 'registration', 'website', 'document', 'other')),
  entity_id uuid,
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create event_task_templates table
CREATE TABLE IF NOT EXISTS event_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  event_type text CHECK (event_type IN ('championship', 'regatta', 'social', 'training', 'meeting', 'other')),
  event_duration_days integer,
  tasks jsonb DEFAULT '[]'::jsonb,
  default_lanes jsonb DEFAULT '[]'::jsonb,
  is_public boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create event_automation_rules table
CREATE TABLE IF NOT EXISTS event_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid REFERENCES event_task_boards(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'task_overdue', 'task_due_soon', 'lane_changed', 'task_assigned', 
    'task_completed', 'wip_limit_reached', 'dependency_blocked',
    'time_based', 'manual'
  )),
  trigger_conditions jsonb DEFAULT '{}'::jsonb,
  action_type text NOT NULL CHECK (action_type IN (
    'send_notification', 'send_email', 'assign_user', 'move_lane',
    'update_priority', 'add_comment', 'create_task', 'escalate'
  )),
  action_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create channel members junction table
CREATE TABLE IF NOT EXISTS event_channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES event_team_channels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_muted boolean DEFAULT false,
  last_read_at timestamptz,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_club_tasks_event_id ON club_tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_board_id ON club_tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_lane_id ON club_tasks(lane_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_position ON club_tasks(board_id, lane_id, position);

CREATE INDEX IF NOT EXISTS idx_event_task_boards_event_id ON event_task_boards(event_id);
CREATE INDEX IF NOT EXISTS idx_event_task_boards_club_id ON event_task_boards(club_id);
CREATE INDEX IF NOT EXISTS idx_event_task_boards_is_template ON event_task_boards(is_template);

CREATE INDEX IF NOT EXISTS idx_event_task_lanes_board_id ON event_task_lanes(board_id);
CREATE INDEX IF NOT EXISTS idx_event_task_lanes_position ON event_task_lanes(board_id, position);

CREATE INDEX IF NOT EXISTS idx_event_task_dependencies_task_id ON event_task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_event_task_dependencies_depends_on ON event_task_dependencies(depends_on_task_id);

CREATE INDEX IF NOT EXISTS idx_event_team_channels_event_id ON event_team_channels(event_id);
CREATE INDEX IF NOT EXISTS idx_event_channel_messages_channel_id ON event_channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_event_channel_messages_thread_id ON event_channel_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_event_channel_messages_created_at ON event_channel_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_activity_feed_event_id ON event_activity_feed(event_id);
CREATE INDEX IF NOT EXISTS idx_event_activity_feed_created_at ON event_activity_feed(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_channel_members_channel_id ON event_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_event_channel_members_user_id ON event_channel_members(user_id);

-- Enable RLS
ALTER TABLE event_task_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_task_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_channel_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_task_boards
CREATE POLICY "Users can view boards for their organizations"
  ON event_task_boards FOR SELECT
  TO authenticated
  USING (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    OR is_template = true
  );

CREATE POLICY "Users can create boards for their organizations"
  ON event_task_boards FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update boards for their organizations"
  ON event_task_boards FOR UPDATE
  TO authenticated
  USING (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete boards for their organizations"
  ON event_task_boards FOR DELETE
  TO authenticated
  USING (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
  );

-- RLS Policies for event_task_lanes
CREATE POLICY "Users can view lanes for their boards"
  ON event_task_lanes FOR SELECT
  TO authenticated
  USING (
    board_id IN (SELECT id FROM event_task_boards WHERE 
      club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
      OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
      OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
      OR is_template = true
    )
  );

CREATE POLICY "Users can manage lanes for their boards"
  ON event_task_lanes FOR ALL
  TO authenticated
  USING (
    board_id IN (SELECT id FROM event_task_boards WHERE 
      club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
      OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
      OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for event_task_dependencies
CREATE POLICY "Users can view task dependencies"
  ON event_task_dependencies FOR SELECT
  TO authenticated
  USING (
    task_id IN (SELECT id FROM club_tasks WHERE 
      club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
      OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
      OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage task dependencies"
  ON event_task_dependencies FOR ALL
  TO authenticated
  USING (
    task_id IN (SELECT id FROM club_tasks WHERE 
      club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
      OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
      OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for event_team_channels
CREATE POLICY "Users can view channels for their events"
  ON event_team_channels FOR SELECT
  TO authenticated
  USING (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    OR id IN (SELECT channel_id FROM event_channel_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create channels for their events"
  ON event_team_channels FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update channels for their events"
  ON event_team_channels FOR UPDATE
  TO authenticated
  USING (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
  );

-- RLS Policies for event_channel_messages
CREATE POLICY "Users can view messages in their channels"
  ON event_channel_messages FOR SELECT
  TO authenticated
  USING (
    channel_id IN (
      SELECT id FROM event_team_channels WHERE 
        club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
        OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
        OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
        OR id IN (SELECT channel_id FROM event_channel_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their channels"
  ON event_channel_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    channel_id IN (
      SELECT id FROM event_team_channels WHERE 
        club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
        OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
        OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
        OR id IN (SELECT channel_id FROM event_channel_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own messages"
  ON event_channel_messages FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON event_channel_messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for event_activity_feed
CREATE POLICY "Users can view activity for their events"
  ON event_activity_feed FOR SELECT
  TO authenticated
  USING (
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
  );

CREATE POLICY "System can create activity entries"
  ON event_activity_feed FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for event_task_templates
CREATE POLICY "Users can view public templates and their own"
  ON event_task_templates FOR SELECT
  TO authenticated
  USING (
    is_public = true
    OR created_by = auth.uid()
    OR club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
    OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create templates"
  ON event_task_templates FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own templates"
  ON event_task_templates FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own templates"
  ON event_task_templates FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policies for event_automation_rules
CREATE POLICY "Users can view automation rules for their boards"
  ON event_automation_rules FOR SELECT
  TO authenticated
  USING (
    board_id IN (SELECT id FROM event_task_boards WHERE 
      club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
      OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
      OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage automation rules for their boards"
  ON event_automation_rules FOR ALL
  TO authenticated
  USING (
    board_id IN (SELECT id FROM event_task_boards WHERE 
      club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
      OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
      OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for event_channel_members
CREATE POLICY "Users can view channel memberships"
  ON event_channel_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR channel_id IN (
      SELECT id FROM event_team_channels WHERE 
        club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
        OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
        OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can join channels"
  ON event_channel_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own membership"
  ON event_channel_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can leave channels"
  ON event_channel_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for collaboration features
ALTER PUBLICATION supabase_realtime ADD TABLE event_channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE event_activity_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE club_tasks;

-- Create function to automatically create default lanes when a board is created
CREATE OR REPLACE FUNCTION create_default_board_lanes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create default lanes if this is not a template being created from scratch
  IF NEW.is_template = false THEN
    INSERT INTO event_task_lanes (board_id, name, description, color, position, lane_type, is_default)
    VALUES
      (NEW.id, 'Backlog', 'Tasks waiting to be started', '#94a3b8', 0, 'backlog', true),
      (NEW.id, 'Planning', 'Tasks in planning phase', '#3b82f6', 1, 'planning', true),
      (NEW.id, 'In Progress', 'Tasks currently being worked on', '#f59e0b', 2, 'in_progress', true),
      (NEW.id, 'Review', 'Tasks awaiting review or approval', '#8b5cf6', 3, 'review', true),
      (NEW.id, 'Completed', 'Finished tasks', '#10b981', 4, 'completed', true);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_default_lanes
  AFTER INSERT ON event_task_boards
  FOR EACH ROW
  EXECUTE FUNCTION create_default_board_lanes();

-- Create function to log activity when tasks change
CREATE OR REPLACE FUNCTION log_task_activity()
RETURNS TRIGGER AS $$
DECLARE
  activity_title text;
  activity_desc text;
  activity_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    activity_type := 'task_created';
    activity_title := 'Task created: ' || NEW.title;
    activity_desc := NEW.description;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status AND NEW.status = 'completed' THEN
      activity_type := 'task_completed';
      activity_title := 'Task completed: ' || NEW.title;
    ELSIF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
      activity_type := 'task_assigned';
      activity_title := 'Task assigned: ' || NEW.title;
    ELSIF OLD.lane_id IS DISTINCT FROM NEW.lane_id THEN
      activity_type := 'task_updated';
      activity_title := 'Task moved: ' || NEW.title;
    ELSE
      activity_type := 'task_updated';
      activity_title := 'Task updated: ' || NEW.title;
    END IF;
    activity_desc := NEW.description;
  END IF;
  
  -- Only log if task is associated with an event
  IF NEW.event_id IS NOT NULL THEN
    INSERT INTO event_activity_feed (
      event_id, club_id, state_association_id, national_association_id,
      user_id, activity_type, entity_type, entity_id, title, description
    ) VALUES (
      NEW.event_id, NEW.club_id, NEW.state_association_id, NEW.national_association_id,
      auth.uid(), activity_type, 'task', NEW.id, activity_title, activity_desc
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_task_activity
  AFTER INSERT OR UPDATE ON club_tasks
  FOR EACH ROW
  WHEN (NEW.event_id IS NOT NULL)
  EXECUTE FUNCTION log_task_activity();

-- Create function to update task position when moving between lanes
CREATE OR REPLACE FUNCTION update_task_position()
RETURNS TRIGGER AS $$
BEGIN
  -- If lane changed, set position to end of new lane
  IF OLD.lane_id IS DISTINCT FROM NEW.lane_id THEN
    NEW.position := COALESCE(
      (SELECT MAX(position) + 1 FROM club_tasks WHERE lane_id = NEW.lane_id),
      0
    );
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_task_position
  BEFORE UPDATE ON club_tasks
  FOR EACH ROW
  WHEN (OLD.lane_id IS DISTINCT FROM NEW.lane_id)
  EXECUTE FUNCTION update_task_position();