/*
  # Create Storage Stats RPC Function

  1. New Functions
    - `get_storage_stats` - Returns storage bucket statistics including:
      - Bucket count
      - Total file count across all buckets
      - Total storage size in bytes
      - Per-bucket breakdown (name, file count, size, public flag)
  
  2. Security
    - Function uses SECURITY DEFINER to access storage schema
    - Only super_admin users can call this function
    - Search path restricted to prevent schema injection
*/

CREATE OR REPLACE FUNCTION get_storage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
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
