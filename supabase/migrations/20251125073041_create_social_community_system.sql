/*
  # Social Community System - Activity Feed, Groups, and Connections

  1. New Tables
    - `social_groups`
      - Community groups at club, state, national levels
      - Public/private visibility
      - Moderation settings
    
    - `social_group_members`
      - Group membership tracking
      - Role assignments (admin, moderator, member)
    
    - `social_posts`
      - Activity feed posts with rich content
      - Privacy levels (public, friends, groups)
      - Moderation flags
    
    - `social_comments`
      - Nested comments on posts
      - Reply tracking
    
    - `social_reactions`
      - Likes, loves, and other reactions
      - Support for multiple reaction types
    
    - `social_connections`
      - Friend/follower relationships
      - Connection requests
    
    - `social_mentions`
      - @mention tracking for notifications
    
    - `social_hashtags`
      - Hashtag system for content discovery
    
    - `social_media_attachments`
      - Media files attached to posts
    
    - `social_notifications`
      - Activity notifications
    
    - `social_badges`
      - Gamification badges
    
    - `member_badges`
      - Badge assignments to members
    
    - `member_activity_points`
      - Gamification points tracking

  2. Security
    - Enable RLS on all tables
    - Privacy-aware policies
    - Group membership validation
    - Connection-based access control
*/

-- Social Groups
CREATE TABLE IF NOT EXISTS social_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cover_image_url text,
  avatar_url text,
  group_type text NOT NULL CHECK (group_type IN ('club', 'state', 'national', 'interest', 'custom')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'secret')),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  require_approval boolean DEFAULT false,
  allow_member_posts boolean DEFAULT true,
  moderate_posts boolean DEFAULT false,
  member_count integer DEFAULT 0,
  post_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Social Group Members
CREATE TABLE IF NOT EXISTS social_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'banned')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Social Posts
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  group_id uuid REFERENCES social_groups(id) ON DELETE CASCADE,
  content text NOT NULL,
  content_type text DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'link', 'poll', 'event')),
  privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'friends', 'group', 'private')),
  link_url text,
  link_title text,
  link_description text,
  link_image_url text,
  poll_options jsonb,
  poll_votes jsonb,
  poll_ends_at timestamptz,
  location text,
  feeling text,
  is_pinned boolean DEFAULT false,
  is_moderated boolean DEFAULT false,
  moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at timestamptz,
  moderation_reason text,
  like_count integer DEFAULT 0,
  comment_count integer DEFAULT 0,
  share_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Social Comments
CREATE TABLE IF NOT EXISTS social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  like_count integer DEFAULT 0,
  reply_count integer DEFAULT 0,
  is_moderated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Social Reactions
CREATE TABLE IF NOT EXISTS social_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'like' CHECK (reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id, reaction_type),
  UNIQUE(user_id, comment_id, reaction_type),
  CHECK ((post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL))
);

-- Social Connections (Friends/Followers)
CREATE TABLE IF NOT EXISTS social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connected_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_type text NOT NULL DEFAULT 'follow' CHECK (connection_type IN ('friend', 'follow')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(user_id, connected_user_id),
  CHECK (user_id != connected_user_id)
);

-- Social Mentions
CREATE TABLE IF NOT EXISTS social_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioned_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Social Hashtags
CREATE TABLE IF NOT EXISTS social_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag text NOT NULL UNIQUE,
  use_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Social Post Hashtags (junction table)
CREATE TABLE IF NOT EXISTS social_post_hashtags (
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES social_hashtags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, hashtag_id)
);

-- Social Media Attachments
CREATE TABLE IF NOT EXISTS social_media_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'video', 'document')),
  file_size integer,
  thumbnail_url text,
  width integer,
  height integer,
  duration integer,
  created_at timestamptz DEFAULT now()
);

-- Social Notifications
CREATE TABLE IF NOT EXISTS social_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('like', 'comment', 'mention', 'friend_request', 'friend_accept', 'group_invite', 'group_join', 'badge_earned', 'post_share')),
  post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE,
  group_id uuid REFERENCES social_groups(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES social_connections(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Social Badges
CREATE TABLE IF NOT EXISTS social_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon_url text,
  badge_type text NOT NULL CHECK (badge_type IN ('engagement', 'achievement', 'contribution', 'tenure', 'special')),
  criteria jsonb NOT NULL,
  points_value integer DEFAULT 0,
  rarity text DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  created_at timestamptz DEFAULT now()
);

-- Member Badges
CREATE TABLE IF NOT EXISTS member_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES social_badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

-- Member Activity Points
CREATE TABLE IF NOT EXISTS member_activity_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  points integer DEFAULT 0,
  level integer DEFAULT 1,
  total_posts integer DEFAULT 0,
  total_comments integer DEFAULT 0,
  total_likes_received integer DEFAULT 0,
  total_connections integer DEFAULT 0,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, club_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_groups_club_id ON social_groups(club_id);
CREATE INDEX IF NOT EXISTS idx_social_groups_visibility ON social_groups(visibility);
CREATE INDEX IF NOT EXISTS idx_social_group_members_user_id ON social_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_social_group_members_group_id ON social_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_author_id ON social_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_club_id ON social_posts(club_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_group_id ON social_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_comments_post_id ON social_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_author_id ON social_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_social_reactions_post_id ON social_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_social_reactions_user_id ON social_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_user_id ON social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_status ON social_connections(status);
CREATE INDEX IF NOT EXISTS idx_social_notifications_user_id_unread ON social_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_social_mentions_user_id ON social_mentions(mentioned_user_id);

-- Enable Row Level Security
ALTER TABLE social_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_media_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_activity_points ENABLE ROW LEVEL SECURITY;

-- RLS Policies for social_groups
CREATE POLICY "Users can view public groups"
  ON social_groups FOR SELECT
  TO authenticated
  USING (visibility = 'public');

CREATE POLICY "Users can view groups they are members of"
  ON social_groups FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT group_id FROM social_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can create groups"
  ON social_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update groups"
  ON social_groups FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT group_id FROM social_group_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Group admins can delete groups"
  ON social_groups FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT group_id FROM social_group_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for social_group_members
CREATE POLICY "Users can view group members of groups they can see"
  ON social_group_members FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT id FROM social_groups WHERE visibility = 'public'
    )
    OR
    group_id IN (
      SELECT group_id FROM social_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can join public groups"
  ON social_group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND
    group_id IN (SELECT id FROM social_groups WHERE visibility = 'public' AND require_approval = false)
  );

CREATE POLICY "Group admins can manage members"
  ON social_group_members FOR ALL
  TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM social_group_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- RLS Policies for social_posts
CREATE POLICY "Users can view public posts"
  ON social_posts FOR SELECT
  TO authenticated
  USING (
    privacy = 'public'
    AND is_moderated = false
  );

CREATE POLICY "Users can view posts in their groups"
  ON social_posts FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM social_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can view posts from their connections"
  ON social_posts FOR SELECT
  TO authenticated
  USING (
    privacy = 'friends'
    AND author_id IN (
      SELECT connected_user_id FROM social_connections
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "Users can view their own posts"
  ON social_posts FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Users can create posts"
  ON social_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own posts"
  ON social_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Users can delete their own posts"
  ON social_posts FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Moderators can moderate posts"
  ON social_posts FOR UPDATE
  TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM social_group_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- RLS Policies for social_comments
CREATE POLICY "Users can view comments on posts they can see"
  ON social_comments FOR SELECT
  TO authenticated
  USING (
    post_id IN (SELECT id FROM social_posts)
  );

CREATE POLICY "Users can create comments"
  ON social_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own comments"
  ON social_comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON social_comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- RLS Policies for social_reactions
CREATE POLICY "Users can view all reactions"
  ON social_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create reactions"
  ON social_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
  ON social_reactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for social_connections
CREATE POLICY "Users can view their own connections"
  ON social_connections FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR connected_user_id = auth.uid());

CREATE POLICY "Users can create connections"
  ON social_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
  ON social_connections FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR connected_user_id = auth.uid());

CREATE POLICY "Users can delete their own connections"
  ON social_connections FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for social_mentions
CREATE POLICY "Users can view mentions"
  ON social_mentions FOR SELECT
  TO authenticated
  USING (mentioned_user_id = auth.uid() OR mentioned_by_user_id = auth.uid());

CREATE POLICY "Users can create mentions"
  ON social_mentions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = mentioned_by_user_id);

-- RLS Policies for social_hashtags
CREATE POLICY "Anyone can view hashtags"
  ON social_hashtags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage hashtags"
  ON social_hashtags FOR ALL
  TO authenticated
  USING (true);

-- RLS Policies for social_post_hashtags
CREATE POLICY "Anyone can view post hashtags"
  ON social_post_hashtags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add hashtags to their posts"
  ON social_post_hashtags FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (SELECT id FROM social_posts WHERE author_id = auth.uid())
  );

-- RLS Policies for social_media_attachments
CREATE POLICY "Users can view attachments on posts they can see"
  ON social_media_attachments FOR SELECT
  TO authenticated
  USING (
    post_id IN (SELECT id FROM social_posts)
    OR comment_id IN (SELECT id FROM social_comments)
  );

CREATE POLICY "Users can create attachments on their content"
  ON social_media_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (SELECT id FROM social_posts WHERE author_id = auth.uid())
    OR comment_id IN (SELECT id FROM social_comments WHERE author_id = auth.uid())
  );

-- RLS Policies for social_notifications
CREATE POLICY "Users can view their own notifications"
  ON social_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
  ON social_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON social_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for social_badges
CREATE POLICY "Anyone can view badges"
  ON social_badges FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for member_badges
CREATE POLICY "Users can view all earned badges"
  ON member_badges FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can award badges"
  ON member_badges FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for member_activity_points
CREATE POLICY "Users can view all activity points"
  ON member_activity_points FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage activity points"
  ON member_activity_points FOR ALL
  TO authenticated
  USING (true);

-- Triggers to update counts
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE social_posts
    SET comment_count = comment_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE social_posts
    SET comment_count = GREATEST(0, comment_count - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_post_comment_count_trigger
AFTER INSERT OR DELETE ON social_comments
FOR EACH ROW
EXECUTE FUNCTION update_post_comment_count();

CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.post_id IS NOT NULL THEN
    UPDATE social_posts
    SET like_count = like_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.post_id IS NOT NULL THEN
    UPDATE social_posts
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_post_like_count_trigger
AFTER INSERT OR DELETE ON social_reactions
FOR EACH ROW
EXECUTE FUNCTION update_post_like_count();

CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE social_groups
    SET member_count = member_count + 1
    WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE social_groups
    SET member_count = GREATEST(0, member_count - 1)
    WHERE id = OLD.group_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'active' AND OLD.status != 'active' THEN
      UPDATE social_groups
      SET member_count = member_count + 1
      WHERE id = NEW.group_id;
    ELSIF NEW.status != 'active' AND OLD.status = 'active' THEN
      UPDATE social_groups
      SET member_count = GREATEST(0, member_count - 1)
      WHERE id = NEW.group_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_group_member_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON social_group_members
FOR EACH ROW
EXECUTE FUNCTION update_group_member_count();
