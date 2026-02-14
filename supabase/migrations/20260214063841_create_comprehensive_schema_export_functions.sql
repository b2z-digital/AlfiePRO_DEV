/*
  # Comprehensive Schema Export Functions

  Creates helper functions for full database backup including:

  1. New Functions
    - `export_table_schemas()` - returns CREATE TABLE DDL for all public tables
    - `export_rls_policies()` - returns all RLS policies with their definitions
    - `export_database_functions()` - returns all user-defined functions
    - `export_triggers()` - returns all triggers on public tables
    - `export_indexes()` - returns all indexes on public tables
    - `export_enums()` - returns all custom enum types
    - `export_foreign_keys()` - returns all foreign key constraints

  These functions use SECURITY DEFINER to access system catalogs safely.
*/

CREATE OR REPLACE FUNCTION export_table_schemas()
RETURNS TABLE(
  table_name text,
  column_name text,
  data_type text,
  column_default text,
  is_nullable text,
  character_maximum_length integer,
  ordinal_position integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
STABLE
AS $$
  SELECT 
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.column_default::text,
    c.is_nullable::text,
    c.character_maximum_length::integer,
    c.ordinal_position::integer
  FROM information_schema.columns c
  JOIN information_schema.tables t 
    ON t.table_name = c.table_name AND t.table_schema = c.table_schema
  WHERE c.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name, c.ordinal_position;
$$;

CREATE OR REPLACE FUNCTION export_rls_policies()
RETURNS TABLE(
  table_name text,
  policy_name text,
  policy_cmd text,
  policy_roles text[],
  qual_expr text,
  with_check_expr text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
  SELECT 
    schemaname || '.' || tablename as table_name,
    policyname as policy_name,
    cmd as policy_cmd,
    roles as policy_roles,
    qual::text as qual_expr,
    with_check::text as with_check_expr
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
$$;

CREATE OR REPLACE FUNCTION export_database_functions()
RETURNS TABLE(
  function_name text,
  function_schema text,
  return_type text,
  argument_types text,
  function_definition text,
  language text,
  security_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
STABLE
AS $$
  SELECT 
    p.proname::text as function_name,
    n.nspname::text as function_schema,
    pg_get_function_result(p.oid)::text as return_type,
    pg_get_function_arguments(p.oid)::text as argument_types,
    pg_get_functiondef(p.oid)::text as function_definition,
    l.lanname::text as language,
    CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
  ORDER BY p.proname;
$$;

CREATE OR REPLACE FUNCTION export_triggers()
RETURNS TABLE(
  trigger_name text,
  table_name text,
  event_manipulation text,
  action_timing text,
  action_statement text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, information_schema
STABLE
AS $$
  SELECT 
    trigger_name::text,
    event_object_table::text as table_name,
    string_agg(event_manipulation, ' OR ')::text as event_manipulation,
    action_timing::text,
    action_statement::text
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  GROUP BY trigger_name, event_object_table, action_timing, action_statement
  ORDER BY event_object_table, trigger_name;
$$;

CREATE OR REPLACE FUNCTION export_indexes()
RETURNS TABLE(
  index_name text,
  table_name text,
  index_definition text,
  is_unique boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
  SELECT 
    i.relname::text as index_name,
    t.relname::text as table_name,
    pg_get_indexdef(i.oid)::text as index_definition,
    ix.indisunique as is_unique
  FROM pg_index ix
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND NOT ix.indisprimary
  ORDER BY t.relname, i.relname;
$$;

CREATE OR REPLACE FUNCTION export_enums()
RETURNS TABLE(
  enum_name text,
  enum_values text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
  SELECT 
    t.typname::text as enum_name,
    array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] as enum_values
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
  GROUP BY t.typname
  ORDER BY t.typname;
$$;

CREATE OR REPLACE FUNCTION export_foreign_keys()
RETURNS TABLE(
  constraint_name text,
  source_table text,
  source_columns text[],
  target_table text,
  target_columns text[],
  on_delete text,
  on_update text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
STABLE
AS $$
  SELECT
    tc.constraint_name::text,
    tc.table_name::text as source_table,
    array_agg(DISTINCT kcu.column_name)::text[] as source_columns,
    ccu.table_name::text as target_table,
    array_agg(DISTINCT ccu.column_name)::text[] as target_columns,
    rc.delete_rule::text as on_delete,
    rc.update_rule::text as on_update
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  GROUP BY tc.constraint_name, tc.table_name, ccu.table_name, rc.delete_rule, rc.update_rule
  ORDER BY tc.table_name, tc.constraint_name;
$$;