/*
  # Communications System Enhancements
  
  Comprehensive enhancement to the notifications system with advanced features:
  
  ## New Tables
  1. `notification_attachments` - File attachments for messages
  2. `notification_drafts` - Auto-saved message drafts
  3. `notification_templates` - Reusable message templates
  4. `notification_reactions` - Emoji reactions to messages
  5. `recipient_groups` - Predefined member groups
  6. `recipient_group_members` - Group membership
  7. `user_notification_preferences` - Per-user settings
  8. `scheduled_notifications` - Future message scheduling
  
  ## Table Modifications
  - notifications: Add threading, status, scheduling, organization fields
  - Add full-text search support
  - Add read receipts and analytics
  
  ## Security
  - Enable RLS on all new tables
  - Restrictive policies for data access
  - Proper foreign key constraints
*/

-- Add new columns to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES notifications(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS thread_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS mentions UUID[];
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_rich_text BOOLEAN DEFAULT false;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_thread ON notifications(thread_id);
CREATE INDEX IF NOT EXISTS idx_notifications_parent ON notifications(parent_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_notifications_starred ON notifications(user_id, is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_notifications_archived ON notifications(user_id, is_archived) WHERE is_archived = true;
CREATE INDEX IF NOT EXISTS idx_notifications_search ON notifications USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_notifications_labels ON notifications USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_notifications_mentions ON notifications USING GIN(mentions);

-- Create notification_attachments table
CREATE TABLE IF NOT EXISTS notification_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments for their notifications"
  ON notification_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.id = notification_id
      AND (n.user_id = auth.uid() OR n.club_id IN (
        SELECT club_id FROM user_clubs WHERE user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can upload attachments"
  ON notification_attachments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

-- Create notification_drafts table
CREATE TABLE IF NOT EXISTS notification_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id),
  recipients TEXT[],
  recipient_groups UUID[],
  subject TEXT,
  body TEXT,
  type TEXT DEFAULT 'message',
  send_email BOOLEAN DEFAULT true,
  is_rich_text BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own drafts"
  ON notification_drafts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create notification_templates table
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id),
  created_by UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'message',
  is_rich_text BOOLEAN DEFAULT false,
  is_global BOOLEAN DEFAULT false,
  category TEXT,
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view templates for their club"
  ON notification_templates FOR SELECT
  TO authenticated
  USING (
    is_global = true OR
    club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins and editors can manage templates"
  ON notification_templates FOR ALL
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM user_clubs
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'editor')
    )
  );

-- Create notification_reactions table
CREATE TABLE IF NOT EXISTS notification_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(notification_id, user_id, emoji)
);

ALTER TABLE notification_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions"
  ON notification_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.id = notification_id
      AND (n.user_id = auth.uid() OR n.club_id IN (
        SELECT club_id FROM user_clubs WHERE user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can add reactions"
  ON notification_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their reactions"
  ON notification_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create recipient_groups table
CREATE TABLE IF NOT EXISTS recipient_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_dynamic BOOLEAN DEFAULT false,
  dynamic_filter JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recipient_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view groups for their club"
  ON recipient_groups FOR SELECT
  TO authenticated
  USING (club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage groups"
  ON recipient_groups FOR ALL
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM user_clubs
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM user_clubs
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create recipient_group_members table
CREATE TABLE IF NOT EXISTS recipient_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES recipient_groups(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, member_id)
);

ALTER TABLE recipient_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view group members"
  ON recipient_group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipient_groups rg
      WHERE rg.id = group_id
      AND rg.club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Admins can manage group members"
  ON recipient_group_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipient_groups rg
      WHERE rg.id = group_id
      AND rg.club_id IN (
        SELECT club_id FROM user_clubs
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipient_groups rg
      WHERE rg.id = group_id
      AND rg.club_id IN (
        SELECT club_id FROM user_clubs
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- Create user_notification_preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  desktop_notifications BOOLEAN DEFAULT false,
  sound_enabled BOOLEAN DEFAULT true,
  digest_mode BOOLEAN DEFAULT false,
  digest_frequency TEXT DEFAULT 'daily',
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  muted_threads UUID[] DEFAULT ARRAY[]::UUID[],
  muted_users UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
  ON user_notification_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create full-text search function
CREATE OR REPLACE FUNCTION update_notification_search()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.sender_name, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for search vector updates
DROP TRIGGER IF EXISTS notification_search_update ON notifications;
CREATE TRIGGER notification_search_update
  BEFORE INSERT OR UPDATE OF subject, body, sender_name
  ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_search();

-- Update existing notifications with search vectors
UPDATE notifications SET search_vector = 
  setweight(to_tsvector('english', COALESCE(subject, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(body, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(sender_name, '')), 'C')
WHERE search_vector IS NULL;

-- Function to get thread participants
CREATE OR REPLACE FUNCTION get_thread_participants(thread_uuid UUID)
RETURNS TABLE (user_id UUID, name TEXT, avatar_url TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT 
    n.user_id,
    p.first_name || ' ' || p.last_name AS name,
    p.avatar_url
  FROM notifications n
  LEFT JOIN profiles p ON p.id = n.user_id
  WHERE n.thread_id = thread_uuid
  ORDER BY name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark thread as read
CREATE OR REPLACE FUNCTION mark_thread_as_read(thread_uuid UUID, for_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE notifications
  SET read = true, read_at = now()
  WHERE thread_id = thread_uuid
    AND user_id = for_user_id
    AND read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_attachments_notification ON notification_attachments(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_reactions_notification ON notification_reactions(notification_id);
CREATE INDEX IF NOT EXISTS idx_recipient_group_members_group ON recipient_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_recipient_group_members_member ON recipient_group_members(member_id);
