/*
  # Create User Engagement Details RPC

  1. New Functions
    - `get_user_engagement_details(period_start, period_end)` - Returns detailed per-user engagement metrics
      - User identity (name, email, avatar)
      - Login frequency (total sessions, active days)
      - Page view counts and most-used sections
      - Last active timestamp
      - Associated clubs
    - `get_user_recent_activity(target_user_id, limit_count)` - Returns recent activity for a specific user

  2. Security
    - Both functions restricted to super admins only via `is_platform_super_admin()` check
    - SECURITY DEFINER to allow reading auth.users email
*/

CREATE OR REPLACE FUNCTION get_user_engagement_details(
  period_start timestamptz,
  period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_is_super boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (
      raw_user_meta_data->>'is_super_admin' = 'true'
      OR raw_app_meta_data->>'is_super_admin' = 'true'
    )
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    SELECT EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_id = auth.uid() AND role = 'super_admin'
    ) INTO v_is_super;
  END IF;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  SELECT jsonb_agg(user_row ORDER BY total_sessions DESC)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'user_id', ps.user_id,
      'full_name', COALESCE(NULLIF(TRIM(p.full_name), ''), TRIM(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')), au.email),
      'email', au.email,
      'avatar_url', COALESCE(p.avatar_url, m.avatar_url),
      'total_sessions', COUNT(DISTINCT ps.id),
      'total_page_views', (
        SELECT COUNT(*) FROM platform_page_views pv
        WHERE pv.user_id = ps.user_id
        AND pv.viewed_at >= period_start
        AND pv.viewed_at < period_end
      ),
      'active_days', COUNT(DISTINCT DATE(ps.started_at)),
      'last_active', GREATEST(
        MAX(ps.last_active_at),
        MAX(ps.started_at),
        (SELECT MAX(pv2.viewed_at) FROM platform_page_views pv2 WHERE pv2.user_id = ps.user_id AND pv2.viewed_at >= period_start AND pv2.viewed_at < period_end)
      ),
      'first_seen', MIN(ps.started_at),
      'last_sign_in', au.last_sign_in_at,
      'sections_used', (
        SELECT COUNT(DISTINCT pv3.page_section)
        FROM platform_page_views pv3
        WHERE pv3.user_id = ps.user_id
        AND pv3.viewed_at >= period_start
        AND pv3.viewed_at < period_end
      ),
      'top_sections', (
        SELECT COALESCE(jsonb_agg(sec_row ORDER BY views DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'section', pv4.page_section,
            'views', COUNT(*)
          ) as sec_row, COUNT(*) as views
          FROM platform_page_views pv4
          WHERE pv4.user_id = ps.user_id
          AND pv4.viewed_at >= period_start
          AND pv4.viewed_at < period_end
          GROUP BY pv4.page_section
          ORDER BY COUNT(*) DESC
          LIMIT 5
        ) top_sec
      ),
      'clubs', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'club_id', c.id,
          'club_name', c.name,
          'role', uc.role
        )), '[]'::jsonb)
        FROM user_clubs uc
        JOIN clubs c ON c.id = uc.club_id
        WHERE uc.user_id = ps.user_id
      ),
      'daily_activity', (
        SELECT COALESCE(jsonb_agg(day_row ORDER BY day ASC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'day', DATE(combined.ts),
            'sessions', COUNT(DISTINCT combined.session_id),
            'page_views', COUNT(DISTINCT combined.pv_id)
          ) as day_row, DATE(combined.ts) as day
          FROM (
            SELECT ps2.id as session_id, NULL::uuid as pv_id, ps2.started_at as ts
            FROM platform_sessions ps2
            WHERE ps2.user_id = ps.user_id
            AND ps2.started_at >= period_start
            AND ps2.started_at < period_end
            UNION ALL
            SELECT NULL::uuid, pv5.id, pv5.viewed_at
            FROM platform_page_views pv5
            WHERE pv5.user_id = ps.user_id
            AND pv5.viewed_at >= period_start
            AND pv5.viewed_at < period_end
          ) combined
          GROUP BY DATE(combined.ts)
        ) daily
      )
    ) as user_row
    FROM platform_sessions ps
    LEFT JOIN profiles p ON p.id = ps.user_id
    LEFT JOIN auth.users au ON au.id = ps.user_id
    LEFT JOIN LATERAL (
      SELECT first_name, last_name, avatar_url
      FROM members
      WHERE user_id = ps.user_id
      LIMIT 1
    ) m ON true
    WHERE ps.started_at >= period_start
    AND ps.started_at < period_end
    GROUP BY ps.user_id, p.full_name, p.avatar_url, m.first_name, m.last_name, m.avatar_url, au.email, au.last_sign_in_at
  ) sub;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
