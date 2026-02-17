/*
  # Fix Platform Analytics Super Admin Authorization

  1. Changes
    - Update `get_platform_analytics_summary` RPC to use `is_platform_super_admin()` function
      instead of checking `user_clubs.role = 'super_admin'`
    - Update RLS SELECT policies on `platform_sessions` and `platform_page_views` to use
      `is_platform_super_admin()` function for consistent super admin detection
    - The `is_platform_super_admin()` function checks `auth.users.raw_user_meta_data->>'is_super_admin'`
      which is the authoritative source for super admin status

  2. Security
    - No change to security model; just aligning the check method
    - `is_platform_super_admin()` is a SECURITY DEFINER function that safely reads auth.users
*/

CREATE OR REPLACE FUNCTION get_platform_analytics_summary(period_start timestamptz, period_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_platform_super_admin() AND NOT EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_clubs.user_id = auth.uid()
    AND user_clubs.role = 'super_admin'
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'total_sessions', (
      SELECT COUNT(*) FROM platform_sessions
      WHERE started_at >= period_start AND started_at < period_end
    ),
    'unique_users', (
      SELECT COUNT(DISTINCT user_id) FROM platform_sessions
      WHERE started_at >= period_start AND started_at < period_end
    ),
    'total_page_views', (
      SELECT COUNT(*) FROM platform_page_views
      WHERE viewed_at >= period_start AND viewed_at < period_end
    ),
    'page_sections', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT page_section, COUNT(*) as views
        FROM platform_page_views
        WHERE viewed_at >= period_start AND viewed_at < period_end
        GROUP BY page_section
        ORDER BY views DESC
        LIMIT 20
      ) t
    ),
    'daily_sessions', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT date_trunc('day', started_at)::date as day, COUNT(*) as sessions, COUNT(DISTINCT user_id) as users
        FROM platform_sessions
        WHERE started_at >= period_start AND started_at < period_end
        GROUP BY day
        ORDER BY day
      ) t
    ),
    'top_clubs', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT ps.club_id, c.name as club_name,
          COUNT(DISTINCT ps.id) as sessions,
          COUNT(DISTINCT ps.user_id) as unique_users,
          COUNT(pv.id) as page_views
        FROM platform_sessions ps
        LEFT JOIN clubs c ON c.id = ps.club_id
        LEFT JOIN platform_page_views pv ON pv.session_id = ps.id
        WHERE ps.started_at >= period_start AND ps.started_at < period_end
        AND ps.club_id IS NOT NULL
        GROUP BY ps.club_id, c.name
        ORDER BY sessions DESC
        LIMIT 50
      ) t
    ),
    'top_associations', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT ps.association_id, ps.association_type,
          CASE
            WHEN ps.association_type = 'state' THEN (SELECT name FROM state_associations WHERE id = ps.association_id)
            WHEN ps.association_type = 'national' THEN (SELECT name FROM national_associations WHERE id = ps.association_id)
            ELSE 'Unknown'
          END as name,
          COUNT(DISTINCT ps.id) as sessions,
          COUNT(DISTINCT ps.user_id) as unique_users,
          COUNT(pv.id) as page_views
        FROM platform_sessions ps
        LEFT JOIN platform_page_views pv ON pv.session_id = ps.id
        WHERE ps.started_at >= period_start AND ps.started_at < period_end
        AND ps.association_id IS NOT NULL
        GROUP BY ps.association_id, ps.association_type
        ORDER BY sessions DESC
        LIMIT 50
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

DROP POLICY IF EXISTS "Super admins can view all sessions" ON platform_sessions;
CREATE POLICY "Super admins can view all sessions"
  ON platform_sessions
  FOR SELECT
  TO authenticated
  USING (
    is_platform_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Super admins can view all page views" ON platform_page_views;
CREATE POLICY "Super admins can view all page views"
  ON platform_page_views
  FOR SELECT
  TO authenticated
  USING (
    is_platform_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );
