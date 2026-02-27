/*
  # Fix get_storage_stats super admin authorization

  1. Changes
    - Update `get_storage_stats` to use `is_platform_super_admin()` in addition to `user_clubs` check
    - Aligns with the same fix applied to analytics summary and other platform RPCs

  2. Security
    - No reduction in security; adding the metadata-based super admin check path
*/

CREATE OR REPLACE FUNCTION get_storage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_platform_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT jsonb_build_object(
    'bucket_count', (SELECT count(*) FROM storage.buckets),
    'total_files', COALESCE((SELECT count(*) FROM storage.objects), 0),
    'total_bytes', COALESCE((SELECT SUM((metadata->>'size')::bigint) FROM storage.objects WHERE metadata->>'size' IS NOT NULL), 0),
    'buckets', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'public', b.public,
          'created_at', b.created_at,
          'file_count', COALESCE(o.file_count, 0),
          'total_bytes', COALESCE(o.total_bytes, 0)
        ) ORDER BY o.total_bytes DESC NULLS LAST
      )
      FROM storage.buckets b
      LEFT JOIN (
        SELECT bucket_id, count(*) AS file_count, SUM((metadata->>'size')::bigint) AS total_bytes
        FROM storage.objects
        WHERE metadata->>'size' IS NOT NULL
        GROUP BY bucket_id
      ) o ON o.bucket_id = b.id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
