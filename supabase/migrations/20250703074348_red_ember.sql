/*
  # Meeting Management Schema

  1. New Tables
    - `meetings` - Stores meeting information including date, time, location
    - `meeting_agendas` - Stores agenda items for meetings

  2. Security
    - Enable RLS on both tables
    - Create policies for proper access control
*/

-- Check if meetings table exists before creating
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'meetings') THEN
    -- Create meetings table
    CREATE TABLE meetings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      name text NOT NULL,
      location text,
      date date NOT NULL,
      start_time time with time zone,
      end_time time with time zone,
      conferencing_url text,
      description text,
      chairperson_id uuid REFERENCES members(id),
      minute_taker_id uuid REFERENCES members(id),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled')),
      minutes_status text DEFAULT 'not_started' CHECK (minutes_status IN ('not_started', 'in_progress', 'completed')),
      members_present jsonb DEFAULT '[]'::jsonb,
      guests_present jsonb DEFAULT '[]'::jsonb,
      minutes_locked boolean DEFAULT false
    );

    -- Create meeting_agendas table
    CREATE TABLE meeting_agendas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      item_number integer NOT NULL,
      item_name text NOT NULL,
      owner_id uuid REFERENCES members(id),
      type text DEFAULT 'for_discussion' CHECK (type IN ('for_noting', 'for_action', 'for_discussion')),
      duration integer, -- in minutes
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      minutes_content text,
      minutes_decision text,
      minutes_tasks text,
      minutes_attachments jsonb DEFAULT '[]'::jsonb
    );

    -- Enable Row Level Security
    ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE meeting_agendas ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Check if triggers exist before creating
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_meetings_updated_at') THEN
    CREATE TRIGGER update_meetings_updated_at
    BEFORE UPDATE ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_meeting_agendas_updated_at') THEN
    CREATE TRIGGER update_meeting_agendas_updated_at
    BEFORE UPDATE ON meeting_agendas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create policies for meetings table (will be ignored if they already exist)
DO $$ 
BEGIN
  -- Users can view club meetings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Users can view club meetings') THEN
    CREATE POLICY "Users can view club meetings"
      ON meetings
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM user_clubs uc
        WHERE uc.club_id = meetings.club_id
        AND uc.user_id = uid()
      ));
  END IF;

  -- Admins/Editors can create club meetings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Admins/Editors can create club meetings') THEN
    CREATE POLICY "Admins/Editors can create club meetings"
      ON meetings
      FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM user_clubs uc
        WHERE uc.club_id = meetings.club_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ));
  END IF;

  -- Admins/Editors can update club meetings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Admins/Editors can update club meetings') THEN
    CREATE POLICY "Admins/Editors can update club meetings"
      ON meetings
      FOR UPDATE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM user_clubs uc
        WHERE uc.club_id = meetings.club_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM user_clubs uc
        WHERE uc.club_id = meetings.club_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ));
  END IF;

  -- Admins/Editors can delete club meetings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Admins/Editors can delete club meetings') THEN
    CREATE POLICY "Admins/Editors can delete club meetings"
      ON meetings
      FOR DELETE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM user_clubs uc
        WHERE uc.club_id = meetings.club_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ));
  END IF;
END $$;

-- Create policies for meeting_agendas table (will be ignored if they already exist)
DO $$ 
BEGIN
  -- Users can view meeting agendas
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_agendas' AND policyname = 'Users can view meeting agendas') THEN
    CREATE POLICY "Users can view meeting agendas"
      ON meeting_agendas
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM meetings m
        JOIN user_clubs uc ON m.club_id = uc.club_id
        WHERE m.id = meeting_agendas.meeting_id
        AND uc.user_id = uid()
      ));
  END IF;

  -- Admins/Editors can add meeting agendas
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_agendas' AND policyname = 'Admins/Editors can add meeting agendas') THEN
    CREATE POLICY "Admins/Editors can add meeting agendas"
      ON meeting_agendas
      FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM meetings m
        JOIN user_clubs uc ON m.club_id = uc.club_id
        WHERE m.id = meeting_agendas.meeting_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ));
  END IF;

  -- Admins/Editors can update meeting agendas
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_agendas' AND policyname = 'Admins/Editors can update meeting agendas') THEN
    CREATE POLICY "Admins/Editors can update meeting agendas"
      ON meeting_agendas
      FOR UPDATE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM meetings m
        JOIN user_clubs uc ON m.club_id = uc.club_id
        WHERE m.id = meeting_agendas.meeting_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM meetings m
        JOIN user_clubs uc ON m.club_id = uc.club_id
        WHERE m.id = meeting_agendas.meeting_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ));
  END IF;

  -- Admins/Editors can delete meeting agendas
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_agendas' AND policyname = 'Admins/Editors can delete meeting agendas') THEN
    CREATE POLICY "Admins/Editors can delete meeting agendas"
      ON meeting_agendas
      FOR DELETE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM meetings m
        JOIN user_clubs uc ON m.club_id = uc.club_id
        WHERE m.id = meeting_agendas.meeting_id
        AND uc.user_id = uid()
        AND uc.role IN ('admin', 'editor')
      ));
  END IF;
END $$;