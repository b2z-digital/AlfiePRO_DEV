/*
  # Enable Realtime for Feature Control Tables

  1. Changes
    - Enable Realtime on `platform_feature_controls` table
    - Enable Realtime on `platform_feature_overrides` table
  
  2. Purpose
    - Allows club/association dashboards to receive instant updates
      when super admin toggles feature flags or overrides
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'platform_feature_controls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_feature_controls;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'platform_feature_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_feature_overrides;
  END IF;
END $$;
