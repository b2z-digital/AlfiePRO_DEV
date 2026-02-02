/*
  # Add policy for users to send notifications to others

  1. Changes
    - Add new RLS policy allowing authenticated users to insert notifications where they are the sender
    - This allows users to send inquiries, offers, and other notifications to other users
    
  2. Security
    - Users can only insert notifications where sender_id matches their user ID
    - This prevents users from impersonating other senders
    - Recipients are determined by the sender, allowing cross-user communication
*/

-- Add policy for users to insert notifications as sender
CREATE POLICY "Users can send notifications to others"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());