-- Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
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
  status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled'))
);

-- Create meeting_agendas table
CREATE TABLE IF NOT EXISTS meeting_agendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  item_number integer NOT NULL,
  item_name text NOT NULL,
  owner_id uuid REFERENCES members(id),
  type text DEFAULT 'for_discussion' CHECK (type IN ('for_noting', 'for_action', 'for_discussion')),
  duration integer, -- in minutes
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create updated_at triggers
CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON meetings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_agendas_updated_at
BEFORE UPDATE ON meeting_agendas
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_agendas ENABLE ROW LEVEL SECURITY;

-- Create policies for meetings table
CREATE POLICY "Users can view club meetings"
  ON meetings
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = meetings.club_id
    AND uc.user_id = auth.uid()
  ));

CREATE POLICY "Admins/Editors can create club meetings"
  ON meetings
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = meetings.club_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ));

CREATE POLICY "Admins/Editors can update club meetings"
  ON meetings
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = meetings.club_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = meetings.club_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ));

CREATE POLICY "Admins/Editors can delete club meetings"
  ON meetings
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = meetings.club_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ));

-- Create policies for meeting_agendas table
CREATE POLICY "Users can view meeting agendas"
  ON meeting_agendas
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = meeting_agendas.meeting_id
    AND uc.user_id = auth.uid()
  ));

CREATE POLICY "Admins/Editors can add meeting agendas"
  ON meeting_agendas
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = meeting_agendas.meeting_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ));

CREATE POLICY "Admins/Editors can update meeting agendas"
  ON meeting_agendas
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = meeting_agendas.meeting_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = meeting_agendas.meeting_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ));

CREATE POLICY "Admins/Editors can delete meeting agendas"
  ON meeting_agendas
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM meetings m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = meeting_agendas.meeting_id
    AND uc.user_id = auth.uid()
    AND uc.role IN ('admin', 'editor')
  ));