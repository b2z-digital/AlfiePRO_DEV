/*
  # Backup Infrastructure and Platform Settings

  1. New Tables
    - `platform_settings`
      - `id` (uuid, primary key)
      - `key` (text, unique) - setting name like 'github_token', 'github_repo'
      - `value` (text) - encrypted/plain setting value
      - `category` (text) - grouping like 'github', 'backup'
      - `updated_by` (uuid) - who last changed it
      - `created_at` / `updated_at` (timestamptz)

  2. Modified Tables
    - `platform_backups` - add `storage_path` column for file reference
    - `platform_backups` - add `table_details` jsonb column for per-table breakdown

  3. New Storage
    - `backups` bucket for storing database export files

  4. New Functions
    - `get_public_table_stats()` - returns table names, row counts, and sizes

  5. Security
    - RLS enabled on platform_settings (super admin only)
    - RLS on backups bucket (super admin only)
*/

-- Platform settings table for GitHub tokens, config, etc.
CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read platform settings"
  ON platform_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can insert platform settings"
  ON platform_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update platform settings"
  ON platform_settings FOR UPDATE
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

CREATE POLICY "Super admins can delete platform settings"
  ON platform_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

-- Add columns to platform_backups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_backups' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE platform_backups ADD COLUMN storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_backups' AND column_name = 'table_details'
  ) THEN
    ALTER TABLE platform_backups ADD COLUMN table_details jsonb;
  END IF;
END $$;

-- Create backups storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 524288000, ARRAY['application/json', 'application/zip'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Super admins can manage backups'
  ) THEN
    CREATE POLICY "Super admins can manage backups"
      ON storage.objects FOR ALL
      TO authenticated
      USING (
        bucket_id = 'backups'
        AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.role = 'super_admin'
        )
      )
      WITH CHECK (
        bucket_id = 'backups'
        AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.role = 'super_admin'
        )
      );
  END IF;
END $$;

-- Function to get table stats
CREATE OR REPLACE FUNCTION get_public_table_stats()
RETURNS TABLE(table_name text, row_count bigint, size_bytes bigint, total_size text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_name::text,
    (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) as row_count,
    pg_total_relation_size(quote_ident(t.table_name))::bigint as size_bytes,
    pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)))::text as total_size
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
  ORDER BY pg_total_relation_size(quote_ident(t.table_name)) DESC;
END;
$$;