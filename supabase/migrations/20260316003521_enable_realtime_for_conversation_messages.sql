/*
  # Enable realtime for conversation messages

  1. Changes
    - Add `conversation_messages` table to realtime publication for live chat updates
    - Add `conversations` table to realtime publication for chat list updates
    - Add `conversation_participants` table to realtime publication for read status updates

  2. Notes
    - Required for the web chat feature to receive messages in real-time
    - Matches mobile app behavior which relies on realtime subscriptions
*/

ALTER PUBLICATION supabase_realtime ADD TABLE conversation_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
