/*
  # Add function to get table columns
  
  1. Changes
    - Create a function to check if a column exists in a table
    - This helps client-side code handle missing columns gracefully
    
  2. Notes
    - Returns column information from information_schema
    - Useful for checking if media column exists before using it
    - Helps prevent errors when database schema changes
*/

-- Create a function to get table columns
CREATE OR REPLACE FUNCTION get_table_columns_rpc(p_table_name text)
RETURNS TABLE (
  table_name text,
  column_name text,
  data_type text,
  is_nullable text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
  FROM 
    information_schema.columns
  WHERE 
    table_schema = 'public'
    AND table_name = p_table_name
  ORDER BY 
    ordinal_position;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_table_columns_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_columns_rpc TO anon;