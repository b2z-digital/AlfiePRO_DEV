/*
  # Remove chat message inbox notification trigger

  1. Changes
    - Drops the trigger `trg_notify_conversation_message` on `conversation_messages`
    - Drops the function `notify_conversation_message()`
    
  2. Reason
    - Chat messages between users were incorrectly creating inbox notification items
      for every single message sent. Chat messages should remain in the chat system only.
    - Push notifications for new chat messages will be handled separately via
      the mobile app push notification system, not via the inbox/notifications table.

  3. Impact
    - Chat messages will no longer appear in the user's Inbox tab
    - Existing inbox items from chat messages remain (no data deleted)
    - Users will still see chat messages in the Chats tab in real-time
*/

DROP TRIGGER IF EXISTS trg_notify_conversation_message ON conversation_messages;

DROP FUNCTION IF EXISTS notify_conversation_message();
