/*
  # Create Race Forms System

  1. New Tables
    - `race_forms`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `name` (text, form name)
      - `description` (text, optional description)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - `is_active` (boolean, for soft deletion)
    - `form_fields`
      - `id` (uuid, primary key)
      - `form_id` (uuid, foreign key to race_forms)
      - `field_name` (text, programmatic name)
      - `field_label` (text, display label)
      - `field_type` (text, input type)
      - `options` (jsonb, for select/radio options)
      - `is_required` (boolean)
      - `placeholder` (text, optional)
      - `order` (integer, display order)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for club members to manage their forms
    - Add policies for club members to manage form fields

  3. Triggers
    - Auto-update timestamps on changes
*/

-- Create race_forms table
CREATE TABLE IF NOT EXISTS race_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Create form_fields table
CREATE TABLE IF NOT EXISTS form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES race_forms(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'date', 'checkbox', 'radio', 'select', 'email', 'phone', 'url')),
  options jsonb DEFAULT '[]'::jsonb,
  is_required boolean DEFAULT false,
  placeholder text,
  field_order integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE race_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;

-- RLS Policies for race_forms
CREATE POLICY "Club members can view their club's forms"
  ON race_forms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = race_forms.club_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can create forms"
  ON race_forms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = race_forms.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can update their club's forms"
  ON race_forms
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = race_forms.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = race_forms.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can delete their club's forms"
  ON race_forms
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = race_forms.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for form_fields
CREATE POLICY "Users can view form fields for their club's forms"
  ON form_fields
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM race_forms rf
      JOIN user_clubs uc ON uc.club_id = rf.club_id
      WHERE rf.id = form_fields.form_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can create form fields"
  ON form_fields
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM race_forms rf
      JOIN user_clubs uc ON uc.club_id = rf.club_id
      WHERE rf.id = form_fields.form_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can update form fields"
  ON form_fields
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM race_forms rf
      JOIN user_clubs uc ON uc.club_id = rf.club_id
      WHERE rf.id = form_fields.form_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM race_forms rf
      JOIN user_clubs uc ON uc.club_id = rf.club_id
      WHERE rf.id = form_fields.form_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can delete form fields"
  ON form_fields
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM race_forms rf
      JOIN user_clubs uc ON uc.club_id = rf.club_id
      WHERE rf.id = form_fields.form_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_race_forms_club_id ON race_forms(club_id);
CREATE INDEX IF NOT EXISTS idx_race_forms_active ON race_forms(is_active);
CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_order ON form_fields(form_id, field_order);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_race_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_form_fields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_race_forms_updated_at
  BEFORE UPDATE ON race_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_race_forms_updated_at();

CREATE TRIGGER update_form_fields_updated_at
  BEFORE UPDATE ON form_fields
  FOR EACH ROW
  EXECUTE FUNCTION update_form_fields_updated_at();