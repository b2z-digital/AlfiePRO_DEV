/*
  # Create National Report Submissions System

  Tracks reports sent from State Associations to National Association,
  enabling incremental reporting of member payments.

  1. New Tables
    - `national_report_submissions`
      - `id` (uuid, primary key)
      - `state_association_id` (uuid, FK to state_associations)
      - `report_type` (text: 'email' or 'download')
      - `report_scope` (text: 'all', 'new_since_last', 'custom')
      - `membership_year` (integer)
      - `member_count` (integer)
      - `total_state_amount` / `total_national_amount` (numeric)
      - `recipient_email` / `recipient_name` / `subject` / `notes` (text)
      - `sent_by` (uuid, FK to auth.users)
      - `created_at` (timestamptz)

    - `national_report_members`
      - `id` (uuid, primary key)
      - `report_id` (uuid, FK to national_report_submissions)
      - `remittance_id` (uuid, FK to membership_remittances)
      - `member_name` / `club_name` (text)
      - `state_fee` / `national_fee` (numeric)
      - `membership_year` (integer)
      - `payment_date` (date)

  2. Security
    - Enable RLS on both tables
    - State admin policies for SELECT, INSERT, DELETE
*/

CREATE TABLE IF NOT EXISTS national_report_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_association_id uuid NOT NULL REFERENCES state_associations(id),
  report_type text NOT NULL DEFAULT 'download',
  report_scope text NOT NULL DEFAULT 'all',
  membership_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  member_count integer NOT NULL DEFAULT 0,
  total_state_amount numeric NOT NULL DEFAULT 0,
  total_national_amount numeric NOT NULL DEFAULT 0,
  recipient_email text,
  recipient_name text,
  subject text,
  notes text,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS national_report_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES national_report_submissions(id) ON DELETE CASCADE,
  remittance_id uuid NOT NULL REFERENCES membership_remittances(id),
  member_name text NOT NULL,
  club_name text NOT NULL DEFAULT '',
  state_fee numeric NOT NULL DEFAULT 0,
  national_fee numeric NOT NULL DEFAULT 0,
  membership_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  payment_date date
);

ALTER TABLE national_report_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE national_report_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_national_report_submissions_state
  ON national_report_submissions(state_association_id);
CREATE INDEX IF NOT EXISTS idx_national_report_submissions_year
  ON national_report_submissions(membership_year);
CREATE INDEX IF NOT EXISTS idx_national_report_members_report
  ON national_report_members(report_id);
CREATE INDEX IF NOT EXISTS idx_national_report_members_remittance
  ON national_report_members(remittance_id);

CREATE POLICY "State admins can view own reports"
  ON national_report_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = national_report_submissions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can create reports"
  ON national_report_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = national_report_submissions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can delete own reports"
  ON national_report_submissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = national_report_submissions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can view report members"
  ON national_report_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN user_state_associations usa ON usa.state_association_id = nrs.state_association_id
      WHERE nrs.id = national_report_members.report_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can create report members"
  ON national_report_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN user_state_associations usa ON usa.state_association_id = nrs.state_association_id
      WHERE nrs.id = national_report_members.report_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can delete report members"
  ON national_report_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM national_report_submissions nrs
      JOIN user_state_associations usa ON usa.state_association_id = nrs.state_association_id
      WHERE nrs.id = national_report_members.report_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );
