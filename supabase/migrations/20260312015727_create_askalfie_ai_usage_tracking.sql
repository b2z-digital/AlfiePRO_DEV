/*
  # Create AskAlfie AI Usage Tracking System

  ## Summary
  Creates tables to track AI API usage and costs for the AskAlfie mobile app feature.
  This data feeds into the Super Admin Resource & Costs dashboard.

  ## New Tables
  - askalfie_usage_logs: Individual query logs with token counts and costs
  - askalfie_usage_summaries: Pre-aggregated daily summaries for fast dashboard queries
  - ai_model_pricing: Pricing reference table per model

  ## Security
  - RLS enabled on all tables
  - Only super admins can read usage data
  - Insert allowed for authenticated users (edge function usage)
*/

-- ============================================================
-- 1. ASKALFIE USAGE LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.askalfie_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  session_id text,
  question_preview text,
  category text DEFAULT 'general',
  model_id text NOT NULL DEFAULT 'claude-haiku-4-5',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  input_cost_usd numeric(10, 8) DEFAULT 0,
  output_cost_usd numeric(10, 8) DEFAULT 0,
  response_time_ms integer,
  success boolean DEFAULT true,
  error_type text,
  source_platform text DEFAULT 'mobile_app',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_askalfie_usage_logs_created_at ON public.askalfie_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_askalfie_usage_logs_club_id ON public.askalfie_usage_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_askalfie_usage_logs_user_id ON public.askalfie_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_askalfie_usage_logs_model_id ON public.askalfie_usage_logs(model_id);

ALTER TABLE public.askalfie_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read AI usage logs"
  ON public.askalfie_usage_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Authenticated users can insert AI usage logs"
  ON public.askalfie_usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 2. ASKALFIE DAILY USAGE SUMMARIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.askalfie_usage_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date date NOT NULL,
  summary_period text NOT NULL DEFAULT 'day',
  total_queries integer DEFAULT 0,
  successful_queries integer DEFAULT 0,
  failed_queries integer DEFAULT 0,
  unique_users integer DEFAULT 0,
  unique_clubs integer DEFAULT 0,
  total_input_tokens bigint DEFAULT 0,
  total_output_tokens bigint DEFAULT 0,
  total_tokens bigint DEFAULT 0,
  total_cost_usd numeric(12, 6) DEFAULT 0,
  avg_response_time_ms numeric(10, 2),
  primary_model text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(summary_date, summary_period)
);

CREATE INDEX IF NOT EXISTS idx_askalfie_summaries_date ON public.askalfie_usage_summaries(summary_date DESC);

ALTER TABLE public.askalfie_usage_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read AI usage summaries"
  ON public.askalfie_usage_summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can manage AI usage summaries"
  ON public.askalfie_usage_summaries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

-- ============================================================
-- 3. AI MODEL PRICING TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL UNIQUE,
  model_name text NOT NULL,
  provider text NOT NULL DEFAULT 'anthropic',
  input_cost_per_1k_tokens numeric(10, 8) NOT NULL DEFAULT 0,
  output_cost_per_1k_tokens numeric(10, 8) NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage AI model pricing"
  ON public.ai_model_pricing
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Authenticated users can read AI model pricing"
  ON public.ai_model_pricing
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ============================================================
-- 4. SEED DEFAULT MODEL PRICING
-- ============================================================
INSERT INTO public.ai_model_pricing (model_id, model_name, provider, input_cost_per_1k_tokens, output_cost_per_1k_tokens, notes)
VALUES
  ('claude-haiku-4-5', 'Claude Haiku 4.5', 'anthropic', 0.00080, 0.00400, 'Fast, cost-efficient model for AskAlfie'),
  ('claude-haiku-3-5', 'Claude 3.5 Haiku', 'anthropic', 0.00080, 0.00400, 'Claude 3.5 Haiku'),
  ('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'anthropic', 0.00300, 0.01500, 'Balanced performance model'),
  ('claude-sonnet-3-5', 'Claude 3.5 Sonnet', 'anthropic', 0.00300, 0.01500, 'Claude 3.5 Sonnet'),
  ('claude-opus-4', 'Claude Opus 4', 'anthropic', 0.01500, 0.07500, 'Most capable model'),
  ('gpt-4o-mini', 'GPT-4o Mini', 'openai', 0.00015, 0.00060, 'OpenAI fast model'),
  ('gpt-4o', 'GPT-4o', 'openai', 0.00250, 0.01000, 'OpenAI flagship model')
ON CONFLICT (model_id) DO NOTHING;

-- ============================================================
-- 5. RPC FUNCTION TO GET AI USAGE STATS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_askalfie_usage_stats(
  p_start_date date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_clubs.user_id = auth.uid()
    AND user_clubs.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: super admin required';
  END IF;

  SELECT jsonb_build_object(
    'total_queries', COALESCE(SUM(total_queries), 0),
    'successful_queries', COALESCE(SUM(successful_queries), 0),
    'failed_queries', COALESCE(SUM(failed_queries), 0),
    'unique_users', COALESCE(SUM(unique_users), 0),
    'unique_clubs', COALESCE(SUM(unique_clubs), 0),
    'total_input_tokens', COALESCE(SUM(total_input_tokens), 0),
    'total_output_tokens', COALESCE(SUM(total_output_tokens), 0),
    'total_tokens', COALESCE(SUM(total_tokens), 0),
    'total_cost_usd', COALESCE(SUM(total_cost_usd), 0),
    'avg_response_time_ms', COALESCE(AVG(avg_response_time_ms), 0)
  )
  INTO v_result
  FROM public.askalfie_usage_summaries
  WHERE summary_date >= p_start_date
    AND summary_date <= p_end_date
    AND summary_period = 'day';

  RETURN v_result;
END;
$$;

-- ============================================================
-- 6. RPC FUNCTION TO GET DAILY BREAKDOWN
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_askalfie_daily_breakdown(
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  summary_date date,
  total_queries integer,
  total_cost_usd numeric,
  total_tokens bigint,
  unique_users integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_clubs.user_id = auth.uid()
    AND user_clubs.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: super admin required';
  END IF;

  RETURN QUERY
  SELECT
    s.summary_date,
    s.total_queries,
    s.total_cost_usd,
    s.total_tokens,
    s.unique_users
  FROM public.askalfie_usage_summaries s
  WHERE s.summary_date >= (CURRENT_DATE - (p_days || ' days')::interval)::date
    AND s.summary_period = 'day'
  ORDER BY s.summary_date ASC;
END;
$$;

-- ============================================================
-- 7. SEED SAMPLE DATA (last 30 days for demo)
-- ============================================================
DO $$
DECLARE
  v_date date;
  v_queries integer;
  v_tokens_in bigint;
  v_tokens_out bigint;
  v_cost numeric;
  v_success integer;
  v_failed integer;
BEGIN
  FOR i IN 0..29 LOOP
    v_date := (CURRENT_DATE - (i || ' days')::interval)::date;
    v_queries := floor(random() * 45 + 5)::integer;
    v_failed := CASE WHEN random() > 0.8 THEN 1 ELSE 0 END;
    v_success := v_queries - v_failed;
    v_tokens_in := v_queries * floor(random() * 200 + 150)::bigint;
    v_tokens_out := v_queries * floor(random() * 400 + 200)::bigint;
    v_cost := (v_tokens_in::numeric * 0.00080 / 1000) + (v_tokens_out::numeric * 0.00400 / 1000);

    INSERT INTO public.askalfie_usage_summaries (
      summary_date,
      summary_period,
      total_queries,
      successful_queries,
      failed_queries,
      unique_users,
      unique_clubs,
      total_input_tokens,
      total_output_tokens,
      total_tokens,
      total_cost_usd,
      avg_response_time_ms,
      primary_model
    ) VALUES (
      v_date,
      'day',
      v_queries,
      v_success,
      v_failed,
      floor(random() * 12 + 2)::integer,
      floor(random() * 5 + 1)::integer,
      v_tokens_in,
      v_tokens_out,
      v_tokens_in + v_tokens_out,
      v_cost,
      floor(random() * 1500 + 800)::numeric,
      'claude-haiku-4-5'
    )
    ON CONFLICT (summary_date, summary_period) DO NOTHING;
  END LOOP;
END $$;
