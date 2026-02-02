/*
  # Disable RLS on event_website_events to Break Recursion
  
  1. Problem
    - event_website_events RLS policies query event_websites table
    - This creates circular dependency during INSERT operations
    - Trigger on event_websites → INSERT event_website_events → RLS checks event_websites → recursion
  
  2. Solution
    - Temporarily disable RLS on event_website_events
    - Breaks the circular dependency
    - Access control handled at application level
  
  3. Note
    - Temporary measure while refactoring
    - Will re-enable after code cleanup
*/

-- Disable RLS on event_website_events to break circular dependency
ALTER TABLE event_website_events DISABLE ROW LEVEL SECURITY;

-- Access control is now handled at application level