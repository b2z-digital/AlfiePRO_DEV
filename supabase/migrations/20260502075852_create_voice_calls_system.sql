/*
  # Create Voice Calls System

  1. New Tables
    - `voice_calls`
      - `id` (uuid, primary key)
      - `caller_id` (uuid, references auth.users)
      - `callee_id` (uuid, references auth.users)
      - `club_id` (uuid, references clubs)
      - `conversation_id` (uuid, nullable - link to chat conversation)
      - `status` (text - ringing, active, ended, missed, declined)
      - `started_at` (timestamptz)
      - `answered_at` (timestamptz, nullable)
      - `ended_at` (timestamptz, nullable)
      - `end_reason` (text - completed, missed, declined, error)
      - `duration_seconds` (integer, default 0)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `voice_calls` table
    - Policies for caller and callee to read/update their own calls
    - Policy for authenticated users to insert calls

  3. Realtime
    - Enable realtime for voice_calls to push call notifications
*/

-- Create voice_calls table
CREATE TABLE IF NOT EXISTS voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES auth.users(id),
  callee_id uuid NOT NULL REFERENCES auth.users(id),
  club_id uuid REFERENCES clubs(id),
  conversation_id uuid,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'declined')),
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('completed', 'missed', 'declined', 'error', 'cancelled')),
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;

-- Caller and callee can view their own calls
CREATE POLICY "Users can view their own calls"
  ON voice_calls FOR SELECT
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Authenticated users can create calls
CREATE POLICY "Authenticated users can create calls"
  ON voice_calls FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = caller_id);

-- Caller and callee can update their own calls
CREATE POLICY "Call participants can update call status"
  ON voice_calls FOR UPDATE
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Index for quick lookup of active calls
CREATE INDEX IF NOT EXISTS idx_voice_calls_callee_status ON voice_calls (callee_id, status) WHERE status = 'ringing';
CREATE INDEX IF NOT EXISTS idx_voice_calls_caller_status ON voice_calls (caller_id, status) WHERE status IN ('ringing', 'active');

-- Enable realtime for call signaling
ALTER PUBLICATION supabase_realtime ADD TABLE voice_calls;
