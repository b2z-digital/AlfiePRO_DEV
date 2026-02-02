/*
  # Fix Personalization Status Column

  1. Changes
    - Update get_personalized_videos function to remove non-existent status column
    - Use is_approved instead for filtering active videos
*/

-- Fix the personalized video recommendations function
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
    WHERE v.is_approved = true
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