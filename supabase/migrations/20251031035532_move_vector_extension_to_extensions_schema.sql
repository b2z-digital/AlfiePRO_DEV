/*
  # Move Vector Extension to Extensions Schema

  This migration moves the vector extension from the public schema to the extensions schema
  to follow security best practices and prevent potential conflicts.

  1. Changes
    - Creates extensions schema if it doesn't exist
    - Moves vector extension to extensions schema
    - Updates search path to include extensions schema
  
  2. Security Impact
    - Reduces attack surface in public schema
    - Follows PostgreSQL extension security best practices
    - Prevents potential naming conflicts
*/

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move vector extension to extensions schema
ALTER EXTENSION vector SET SCHEMA extensions;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
