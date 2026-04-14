/*
  # Enable realtime for social posts

  1. Changes
    - Add `social_posts` table to the Supabase realtime publication
    - This allows real-time subscriptions to receive INSERT/UPDATE/DELETE events
  
  2. Notes
    - Required for the activity feed to show new posts without manual refresh
*/

ALTER PUBLICATION supabase_realtime ADD TABLE social_posts;
