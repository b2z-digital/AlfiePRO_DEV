/*
  # Add message type to conversation messages

  1. Modified Tables
    - `conversation_messages`
      - Added `message_type` (text, default 'text') - differentiates regular messages from system events
        - 'text' = normal chat message
        - 'missed_call' = missed voice/video call
        - 'declined_call' = declined voice/video call  
        - 'completed_call' = successfully completed call with duration

  2. Notes
    - Existing messages default to 'text'
    - System messages (calls) will use sender_id as the caller's ID
    - The content field stores metadata like call duration for completed calls
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_messages' AND column_name = 'message_type'
  ) THEN
    ALTER TABLE conversation_messages ADD COLUMN message_type text NOT NULL DEFAULT 'text';
  END IF;
END $$;
