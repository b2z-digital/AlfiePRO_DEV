/*
  # Create trigger to insert call event messages into conversations

  1. New Functions
    - `insert_call_event_message()` - triggered when a voice_call is updated to a terminal status
      - If the call has a conversation_id, inserts a system message into that conversation
      - For missed calls: inserts "Missed voice call" or "Missed video call"
      - For declined calls: inserts "Declined call"
      - For ended calls with duration > 0: inserts "Voice call - X:XX" or "Video call - X:XX"

  2. New Triggers
    - `trigger_insert_call_event_message` on voice_calls AFTER UPDATE

  3. Notes
    - Only fires when status changes to a terminal state (missed, declined, ended)
    - Only inserts if conversation_id is not null
    - Uses caller_id as sender_id for outgoing calls (so the recipient sees "Missed call from X")
*/

CREATE OR REPLACE FUNCTION insert_call_event_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_type text;
  v_content text;
  v_is_video boolean;
BEGIN
  -- Only fire on terminal status changes
  IF NEW.status NOT IN ('missed', 'declined', 'ended') THEN
    RETURN NEW;
  END IF;

  -- Only if old status was different (prevents re-firing)
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Only if there's a conversation to insert into
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_video := COALESCE(NEW.is_video, false);

  IF NEW.status = 'missed' THEN
    v_message_type := 'missed_call';
    v_content := CASE WHEN v_is_video THEN 'Missed video call' ELSE 'Missed voice call' END;
  ELSIF NEW.status = 'declined' THEN
    v_message_type := 'declined_call';
    v_content := CASE WHEN v_is_video THEN 'Declined video call' ELSE 'Declined voice call' END;
  ELSIF NEW.status = 'ended' AND COALESCE(NEW.duration_seconds, 0) > 0 THEN
    v_message_type := 'completed_call';
    v_content := CASE WHEN v_is_video THEN 'Video call' ELSE 'Voice call' END
      || ' - ' || LPAD((NEW.duration_seconds / 60)::text, 1, '0') || ':' || LPAD((NEW.duration_seconds % 60)::text, 2, '0');
  ELSE
    -- ended with 0 duration = no answer / cancelled
    v_message_type := 'missed_call';
    v_content := CASE WHEN v_is_video THEN 'Missed video call' ELSE 'Missed voice call' END;
  END IF;

  INSERT INTO conversation_messages (conversation_id, sender_id, content, message_type)
  VALUES (NEW.conversation_id, NEW.caller_id, v_content, v_message_type);

  -- Update conversation last message
  UPDATE conversations
  SET last_message_text = v_content,
      last_message_at = now(),
      last_message_sender_id = NEW.caller_id,
      updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_insert_call_event_message ON voice_calls;

CREATE TRIGGER trigger_insert_call_event_message
  AFTER UPDATE ON voice_calls
  FOR EACH ROW
  EXECUTE FUNCTION insert_call_event_message();
