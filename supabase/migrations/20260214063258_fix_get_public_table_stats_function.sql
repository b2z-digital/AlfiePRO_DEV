/*
  # Fix get_public_table_stats function

  The existing function crashes with "more than one row returned by a subquery"
  because the pg_class lookup by relname can match tables in multiple schemas.

  This fix joins pg_class with pg_namespace to ensure only the 'public' schema
  entries are matched.
*/

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
    COALESCE(
      (SELECT c.reltuples::bigint 
       FROM pg_class c 
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = t.table_name AND n.nspname = 'public'),
      0
    ) as row_count,
    pg_total_relation_size(('public.' || quote_ident(t.table_name))::regclass)::bigint as size_bytes,
    pg_size_pretty(pg_total_relation_size(('public.' || quote_ident(t.table_name))::regclass))::text as total_size
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
  ORDER BY pg_total_relation_size(('public.' || quote_ident(t.table_name))::regclass) DESC;
END;
$$;