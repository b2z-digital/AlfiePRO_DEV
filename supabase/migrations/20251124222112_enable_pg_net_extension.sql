/*
  # Enable pg_net Extension
  
  1. Overview
    - Enables pg_net extension for HTTP requests from database
    - Required for cron jobs to call edge functions
  
  2. Security
    - Extension runs in extensions schema
    - Controlled access via function security
*/

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to required roles
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;
