/*
  # Create Platform Analytics System

  1. New Tables
    - `platform_sessions` - Tracks user login sessions
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `club_id` (uuid, nullable)
      - `association_id` (uuid, nullable)
      - `association_type` (text, nullable - 'state' or 'national')
      - `started_at` (timestamptz)
      - `last_active_at` (timestamptz)
      - `user_agent` (text, nullable)
      - `ip_hash` (text, nullable - hashed for privacy)
    - `platform_page_views` - Tracks page/section visits
      - `id` (uuid, primary key)
      - `session_id` (uuid, references platform_sessions)
      - `user_id` (uuid, references auth.users)
      - `club_id` (uuid, nullable)
      - `association_id` (uuid, nullable)
      - `page_path` (text)
      - `page_section` (text - e.g. 'races', 'membership', 'finances')
      - `viewed_at` (timestamptz)
    - `platform_resource_snapshots` - Stores periodic resource/cost snapshots
      - `id` (uuid, primary key)
      - `snapshot_date` (date)
      - `source` (text - 'supabase' or 'aws')
      - `metric_name` (text)
      - `metric_value` (numeric)
      - `unit` (text)
      - `cost_usd` (numeric, nullable)
      - `metadata` (jsonb, nullable)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Only super admins can read analytics data
    - Authenticated users can insert their own sessions/page views
*/

CREATE TABLE IF NOT EXISTS platform_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  club_id uuid,
  association_id uuid,
  association_type text,
  started_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  user_agent text,
  ip_hash text
);

ALTER TABLE platform_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own sessions"
  ON platform_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON platform_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can view all sessions"
  ON platform_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_platform_sessions_user_id ON platform_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_started_at ON platform_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_club_id ON platform_sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_association_id ON platform_sessions(association_id);

CREATE TABLE IF NOT EXISTS platform_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES platform_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  club_id uuid,
  association_id uuid,
  page_path text NOT NULL,
  page_section text NOT NULL DEFAULT 'other',
  viewed_at timestamptz DEFAULT now()
);

ALTER TABLE platform_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own page views"
  ON platform_page_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can view all page views"
  ON platform_page_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_platform_page_views_session_id ON platform_page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_platform_page_views_user_id ON platform_page_views(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_page_views_viewed_at ON platform_page_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_platform_page_views_page_section ON platform_page_views(page_section);
CREATE INDEX IF NOT EXISTS idx_platform_page_views_club_id ON platform_page_views(club_id);

CREATE TABLE IF NOT EXISTS platform_resource_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual',
  metric_name text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  cost_usd numeric,
  club_id uuid,
  association_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_resource_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view resource snapshots"
  ON platform_resource_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert resource snapshots"
  ON platform_resource_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update resource snapshots"
  ON platform_resource_snapshots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_resource_snapshots_date ON platform_resource_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_source ON platform_resource_snapshots(source);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_metric ON platform_resource_snapshots(metric_name);

CREATE OR REPLACE FUNCTION get_platform_analytics_summary(
  period_start timestamptz,
  period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
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