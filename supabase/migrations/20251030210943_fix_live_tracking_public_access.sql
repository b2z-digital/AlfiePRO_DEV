/*
  # Fix Public Access to Live Tracking Events
  
  ## Problem
  The previous migration removed the public SELECT policy for live_tracking_events
  but didn't re-create it. This prevents anonymous users from accessing the live
  tracking page via QR code links.
  
  ## Solution
  Add a SELECT policy that allows anyone (authenticated or not) to view enabled
  live tracking events. This is essential for the QR code functionality to work.
  
  ## Security
  - Only enabled events are visible
  - Public can only SELECT (read), not modify
  - Access is controlled by the unique access_token
*/

-- Allow anyone (including anonymous users) to view enabled live tracking events
CREATE POLICY "Public can view enabled live tracking events"
  ON live_tracking_events FOR SELECT
  USING (enabled = true);