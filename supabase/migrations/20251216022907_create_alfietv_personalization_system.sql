/*
  # AlfieTV Personalization System

  1. New Tables
    - `alfie_tv_viewing_history`
      - Tracks individual video views per user
      - Records watch duration and completion rate
      - Timestamps for analytics
    
    - `alfie_tv_user_preferences`
      - Stores calculated preference scores per user
      - Tracks category/tag preferences
      - Auto-updates based on viewing patterns
    
    - `alfie_tv_video_categories`
      - Categorizes videos (RC Yachts, Full Size, Racing, Tutorials, etc.)
      - Allows multiple categories per video

  2. Security
    - Enable RLS on all tables
    - Users can only read/write their own data
    - Anonymous users cannot access personalization features

  3. Functions
    - Auto-update user preferences after each view
    - Calculate preference scores based on:
      - View count
      - Watch completion rate
      - Recency of views
*/

-- Create viewing history table
CREATE TABLE IF NOT EXISTS alfie_tv_viewing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES alfie_tv_channels(id) ON DELETE SET NULL,
  watch_duration_seconds integer DEFAULT 0,
  video_duration_seconds integer,
  completion_percentage decimal(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN video_duration_seconds > 0 THEN (watch_duration_seconds::decimal / video_duration_seconds * 100)
      ELSE 0
    END
  ) STORED,
  watched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create user preferences table
CREATE TABLE IF NOT EXISTS alfie_tv_user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  preference_score decimal(5,2) DEFAULT 0,
  view_count integer DEFAULT 0,
  avg_completion_rate decimal(5,2) DEFAULT 0,
  last_viewed_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, category)
);

-- Create video categories junction table
CREATE TABLE IF NOT EXISTS alfie_tv_video_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  category text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, category)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_viewing_history_user ON alfie_tv_viewing_history(user_id, watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_viewing_history_video ON alfie_tv_viewing_history(video_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON alfie_tv_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_score ON alfie_tv_user_preferences(user_id, preference_score DESC);
CREATE INDEX IF NOT EXISTS idx_video_categories_video ON alfie_tv_video_categories(video_id);
CREATE INDEX IF NOT EXISTS idx_video_categories_category ON alfie_tv_video_categories(category);

-- Enable RLS
ALTER TABLE alfie_tv_viewing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_video_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for viewing_history
CREATE POLICY "Users can insert own viewing history"
  ON alfie_tv_viewing_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own viewing history"
  ON alfie_tv_viewing_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own viewing history"
  ON alfie_tv_viewing_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_preferences
CREATE POLICY "Users can read own preferences"
  ON alfie_tv_user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON alfie_tv_user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON alfie_tv_user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for video_categories (read-only for users)
CREATE POLICY "Anyone can read video categories"
  ON alfie_tv_video_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage video categories"
  ON alfie_tv_video_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Function to update user preferences based on viewing history
CREATE OR REPLACE FUNCTION update_user_preferences()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_categories text[];
  v_category text;
  v_avg_completion decimal;
  v_view_count integer;
BEGIN
  -- Get all categories for the viewed video
  SELECT ARRAY_AGG(category)
  INTO v_categories
  FROM alfie_tv_video_categories
  WHERE video_id = NEW.video_id;

  -- If video has categories, update preferences
  IF v_categories IS NOT NULL THEN
    FOREACH v_category IN ARRAY v_categories
    LOOP
      -- Calculate stats for this category
      SELECT 
        COUNT(*),
        AVG(completion_percentage)
      INTO v_view_count, v_avg_completion
      FROM alfie_tv_viewing_history vh
      INNER JOIN alfie_tv_video_categories vc ON vh.video_id = vc.video_id
      WHERE vh.user_id = NEW.user_id
      AND vc.category = v_category;

      -- Calculate preference score (0-100)
      -- Formula: (view_count * 2) + (avg_completion * 0.8)
      -- This weights both frequency and engagement
      
      INSERT INTO alfie_tv_user_preferences (
        user_id,
        category,
        preference_score,
        view_count,
        avg_completion_rate,
        last_viewed_at,
        updated_at
      )
      VALUES (
        NEW.user_id,
        v_category,
        LEAST(100, (v_view_count * 2) + (v_avg_completion * 0.8)),
        v_view_count,
        v_avg_completion,
        NEW.watched_at,
        now()
      )
      ON CONFLICT (user_id, category)
      DO UPDATE SET
        preference_score = LEAST(100, (v_view_count * 2) + (v_avg_completion * 0.8)),
        view_count = v_view_count,
        avg_completion_rate = v_avg_completion,
        last_viewed_at = NEW.watched_at,
        updated_at = now();
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to auto-update preferences
DROP TRIGGER IF EXISTS trigger_update_user_preferences ON alfie_tv_viewing_history;
CREATE TRIGGER trigger_update_user_preferences
  AFTER INSERT ON alfie_tv_viewing_history
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences();

-- Function to get personalized video recommendations
CREATE OR REPLACE FUNCTION get_personalized_videos(
  p_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  video_id uuid,
  relevance_score decimal
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH user_prefs AS (
    -- Get user's top preferences
    SELECT category, preference_score
    FROM alfie_tv_user_preferences
    WHERE user_id = p_user_id
    ORDER BY preference_score DESC
  ),
  video_scores AS (
    -- Calculate relevance score for each video
    SELECT 
      v.id as video_id,
      COALESCE(
        SUM(up.preference_score * 0.7) + -- Weight by preference
        (EXTRACT(EPOCH FROM (now() - v.published_at)) / 86400 * -0.1) + -- Recency boost
        (v.view_count * 0.01), -- Popularity boost
        v.view_count * 0.01 -- Default for videos without matching categories
      ) as relevance_score
    FROM alfie_tv_videos v
    LEFT JOIN alfie_tv_video_categories vc ON v.id = vc.video_id
    LEFT JOIN user_prefs up ON vc.category = up.category
    WHERE v.status = 'active'
    AND NOT EXISTS (
      -- Exclude recently watched videos
      SELECT 1 FROM alfie_tv_viewing_history vh
      WHERE vh.user_id = p_user_id
      AND vh.video_id = v.id
      AND vh.watched_at > now() - interval '7 days'
    )
    GROUP BY v.id, v.published_at, v.view_count
    ORDER BY relevance_score DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT * FROM video_scores;
END;
$$;

-- Add default categories to existing videos based on title/description
INSERT INTO alfie_tv_video_categories (video_id, category)
SELECT DISTINCT v.id, 
  CASE
    WHEN v.title ILIKE '%rc%' OR v.title ILIKE '%radio control%' OR v.description ILIKE '%rc yacht%' THEN 'RC Yachts'
    WHEN v.title ILIKE '%full size%' OR v.title ILIKE '%offshore%' OR v.title ILIKE '%ocean race%' THEN 'Full Size Yachting'
    WHEN v.title ILIKE '%tutorial%' OR v.title ILIKE '%how to%' OR v.title ILIKE '%guide%' THEN 'Tutorials'
    WHEN v.title ILIKE '%race%' OR v.title ILIKE '%racing%' OR v.title ILIKE '%regatta%' THEN 'Racing'
    WHEN v.title ILIKE '%build%' OR v.title ILIKE '%construction%' OR v.title ILIKE '%diy%' THEN 'Building & Maintenance'
    ELSE 'General Sailing'
  END as category
FROM alfie_tv_videos v
WHERE NOT EXISTS (
  SELECT 1 FROM alfie_tv_video_categories vc
  WHERE vc.video_id = v.id
)
ON CONFLICT (video_id, category) DO NOTHING;