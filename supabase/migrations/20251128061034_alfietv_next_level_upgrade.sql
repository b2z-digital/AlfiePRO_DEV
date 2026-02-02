/*
  # AlfieTV Next Level Upgrade

  Transform AlfieTV into a premium streaming experience with smart categorization,
  trending content, personalized recommendations, and Netflix-style UX.

  1. New Columns
    - Channel visibility controls
    - Playlist categorization
    - Video trending/live flags
    - Video ratings
    - Search history
    - User custom lists

  2. Smart Features
    - Auto-categorization
    - Trending calculation
    - Smart search
*/

-- ============================================================================
-- CHANNEL ENHANCEMENTS
-- ============================================================================

ALTER TABLE alfie_tv_channels
ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_alfie_tv_channels_visible ON alfie_tv_channels(is_visible);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_channels_priority ON alfie_tv_channels(priority);

-- ============================================================================
-- YOUTUBE PLAYLISTS ENHANCEMENTS (table already exists)
-- ============================================================================

ALTER TABLE alfie_tv_youtube_playlists
ADD COLUMN IF NOT EXISTS playlist_category text DEFAULT 'general',
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Add constraint after column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'alfie_tv_youtube_playlists_playlist_category_check'
  ) THEN
    ALTER TABLE alfie_tv_youtube_playlists
    ADD CONSTRAINT alfie_tv_youtube_playlists_playlist_category_check 
    CHECK (playlist_category IN (
      'live_events',
      'big_boat_yachting',
      'rc_yachting',
      'training_tips',
      'highlights_recaps',
      'event_archives',
      'general'
    ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alfie_tv_youtube_playlists_category ON alfie_tv_youtube_playlists(playlist_category);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_youtube_playlists_featured ON alfie_tv_youtube_playlists(is_featured);

-- ============================================================================
-- VIDEO ENHANCEMENTS
-- ============================================================================

ALTER TABLE alfie_tv_videos
ADD COLUMN IF NOT EXISTS youtube_playlist_id uuid REFERENCES alfie_tv_youtube_playlists(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_upcoming boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS event_date timestamptz,
ADD COLUMN IF NOT EXISTS detected_keywords text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS detected_year integer,
ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS total_ratings integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_playlist ON alfie_tv_videos(youtube_playlist_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_trending ON alfie_tv_videos(is_trending);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_live ON alfie_tv_videos(is_live);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_upcoming ON alfie_tv_videos(is_upcoming, event_date);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_year ON alfie_tv_videos(detected_year);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_rating ON alfie_tv_videos(average_rating DESC);

-- ============================================================================
-- SEARCH HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS alfie_tv_search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_query text NOT NULL,
  results_count integer DEFAULT 0,
  searched_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alfie_tv_search_history_user ON alfie_tv_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_search_history_query ON alfie_tv_search_history(search_query);

-- ============================================================================
-- USER LISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS alfie_tv_user_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text DEFAULT '📺',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS alfie_tv_user_list_items (
  list_id uuid NOT NULL REFERENCES alfie_tv_user_lists(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES alfie_tv_videos(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (list_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_alfie_tv_user_lists_user ON alfie_tv_user_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_alfie_tv_user_list_items_list ON alfie_tv_user_list_items(list_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE alfie_tv_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_user_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alfie_tv_user_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search history"
  ON alfie_tv_search_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search history"
  ON alfie_tv_search_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own search history"
  ON alfie_tv_search_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own lists"
  ON alfie_tv_user_lists FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own lists"
  ON alfie_tv_user_lists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lists"
  ON alfie_tv_user_lists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lists"
  ON alfie_tv_user_lists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own list items"
  ON alfie_tv_user_list_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_user_lists
      WHERE alfie_tv_user_lists.id = alfie_tv_user_list_items.list_id
      AND alfie_tv_user_lists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add to own lists"
  ON alfie_tv_user_list_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alfie_tv_user_lists
      WHERE alfie_tv_user_lists.id = alfie_tv_user_list_items.list_id
      AND alfie_tv_user_lists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove from own lists"
  ON alfie_tv_user_list_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_user_lists
      WHERE alfie_tv_user_lists.id = alfie_tv_user_list_items.list_id
      AND alfie_tv_user_lists.user_id = auth.uid()
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_tag_video()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  detected_words text[] := '{}';
  detected_yr integer := NULL;
  search_text text;
BEGIN
  search_text := LOWER(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, ''));

  IF search_text ~* 'hobart|rolex|sailgp|americas cup|world championship|regatta' THEN
    detected_words := array_append(detected_words, 'major_event');
  END IF;

  IF search_text ~* '10r|10 rater|ten rater' THEN
    detected_words := array_append(detected_words, '10r');
  END IF;

  IF search_text ~* 'fleet racing|match racing' THEN
    detected_words := array_append(detected_words, 'racing');
  END IF;

  IF search_text ~* 'tutorial|how to|guide|tips|technique' THEN
    detected_words := array_append(detected_words, 'educational');
  END IF;

  IF search_text ~* 'live|streaming' THEN
    detected_words := array_append(detected_words, 'live');
    NEW.is_live := true;
  END IF;

  IF search_text ~* 'highlight|recap|review' THEN
    detected_words := array_append(detected_words, 'highlights');
  END IF;

  FOR detected_yr IN 2020..2030 LOOP
    IF search_text ~ detected_yr::text THEN
      NEW.detected_year := detected_yr;
      EXIT;
    END IF;
  END LOOP;

  NEW.detected_keywords := detected_words;

  IF 'educational' = ANY(detected_words) THEN
    NEW.content_type := 'tutorial';
  ELSIF 'racing' = ANY(detected_words) THEN
    NEW.content_type := 'racing';
  ELSIF 'highlights' = ANY(detected_words) THEN
    NEW.content_type := 'regatta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_tag_video ON alfie_tv_videos;
CREATE TRIGGER trigger_auto_tag_video
  BEFORE INSERT OR UPDATE OF title, description
  ON alfie_tv_videos
  FOR EACH ROW
  EXECUTE FUNCTION auto_tag_video();

CREATE OR REPLACE FUNCTION update_trending_videos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE alfie_tv_videos SET is_trending = false;

  WITH recent_stats AS (
    SELECT AVG(view_count) as avg_views
    FROM alfie_tv_videos
    WHERE published_at > now() - interval '30 days'
  )
  UPDATE alfie_tv_videos v
  SET is_trending = true
  FROM recent_stats rs
  WHERE v.published_at > now() - interval '7 days'
  AND v.view_count > rs.avg_views * 1.5
  AND (v.view_count = 0 OR (v.like_count::float / NULLIF(v.view_count, 0)) > 0.05);
END;
$$;

CREATE OR REPLACE FUNCTION update_video_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE alfie_tv_videos
  SET
    average_rating = (
      SELECT COALESCE(AVG(rating), 0)
      FROM alfie_tv_ratings
      WHERE video_id = NEW.video_id
    ),
    total_ratings = (
      SELECT COUNT(*)
      FROM alfie_tv_ratings
      WHERE video_id = NEW.video_id
    )
  WHERE id = NEW.video_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_video_rating ON alfie_tv_ratings;
CREATE TRIGGER trigger_update_video_rating
  AFTER INSERT OR UPDATE OR DELETE
  ON alfie_tv_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_video_rating();

CREATE OR REPLACE FUNCTION search_alfietv(
  search_query text,
  user_uuid uuid,
  result_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  youtube_id text,
  title text,
  description text,
  thumbnail_url text,
  channel_name text,
  content_type text,
  match_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.youtube_id,
    v.title,
    v.description,
    v.thumbnail_url,
    c.channel_name,
    v.content_type,
    (
      CASE WHEN LOWER(v.title) LIKE '%' || LOWER(search_query) || '%' THEN 100 ELSE 50 END +
      CASE WHEN LOWER(v.description) LIKE '%' || LOWER(search_query) || '%' THEN 30 ELSE 0 END +
      CASE WHEN LOWER(c.channel_name) LIKE '%' || LOWER(search_query) || '%' THEN 50 ELSE 0 END +
      CASE WHEN search_query = ANY(v.tags) THEN 75 ELSE 0 END
    )::real as match_score
  FROM alfie_tv_videos v
  JOIN alfie_tv_channels c ON c.id = v.channel_id
  JOIN user_clubs uc ON uc.club_id = c.club_id
  WHERE uc.user_id = user_uuid
  AND c.is_visible = true
  AND (
    LOWER(v.title) LIKE '%' || LOWER(search_query) || '%'
    OR LOWER(v.description) LIKE '%' || LOWER(search_query) || '%'
    OR LOWER(c.channel_name) LIKE '%' || LOWER(search_query) || '%'
    OR search_query = ANY(v.tags)
    OR search_query = ANY(v.detected_keywords)
  )
  ORDER BY match_score DESC, v.view_count DESC
  LIMIT result_limit;
END;
$$;

CREATE OR REPLACE FUNCTION auto_categorize_playlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  title_lower text;
BEGIN
  title_lower := LOWER(COALESCE(NEW.title, ''));

  IF title_lower ~* 'live|stream' THEN
    NEW.playlist_category := 'live_events';
  ELSIF title_lower ~* 'sailgp|maxi|ocean race|full size|big boat' THEN
    NEW.playlist_category := 'big_boat_yachting';
  ELSIF title_lower ~* 'rc|radio control|10r|rg65|iom' THEN
    NEW.playlist_category := 'rc_yachting';
  ELSIF title_lower ~* 'tutorial|training|how to|tips|technique|learn' THEN
    NEW.playlist_category := 'training_tips';
  ELSIF title_lower ~* 'highlight|recap|best of' THEN
    NEW.playlist_category := 'highlights_recaps';
  ELSIF title_lower ~* 'archive|championship|regatta|worlds' THEN
    NEW.playlist_category := 'event_archives';
  ELSE
    NEW.playlist_category := 'general';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_categorize_playlist ON alfie_tv_youtube_playlists;
CREATE TRIGGER trigger_auto_categorize_playlist
  BEFORE INSERT OR UPDATE OF title
  ON alfie_tv_youtube_playlists
  FOR EACH ROW
  EXECUTE FUNCTION auto_categorize_playlist();