/*
  # Fix Event Websites Security Issues

  1. Enable RLS
    - Enable RLS on `event_websites` table
    - Enable RLS on `event_website_events` table

  2. Security
    - These tables have policies but RLS was not enabled
    - This fixes Supabase security advisor warnings
*/

-- Enable RLS on event_websites
ALTER TABLE event_websites ENABLE ROW LEVEL SECURITY;

-- Enable RLS on event_website_events  
ALTER TABLE event_website_events ENABLE ROW LEVEL SECURITY;
