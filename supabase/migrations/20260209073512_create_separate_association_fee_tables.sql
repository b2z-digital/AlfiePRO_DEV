/*
  # Create Separate Association Fee Tables

  Creates two separate tables for association fee management:
  - state_association_club_fees: State associations set fees for clubs
  - national_association_state_fees: National associations set fees for state associations

  ## New Tables

  ### state_association_club_fees
  - id (uuid, primary key)
  - state_association_id (uuid, references state_associations)
  - club_fee_amount (numeric, the fee clubs pay to state per member)
  - effective_from (date, when this fee structure becomes active)
  - effective_to (date, optional end date)
  - notes (text, optional notes about the fee structure)
  - created_at (timestamptz)
  - created_by (uuid, references auth.users)

  ### national_association_state_fees
  - id (uuid, primary key)
  - national_association_id (uuid, references national_associations)
  - state_fee_amount (numeric, the fee state associations pay to national per member)
  - effective_from (date, when this fee structure becomes active)
  - effective_to (date, optional end date)
  - notes (text, optional notes about the fee structure)
  - created_at (timestamptz)
  - created_by (uuid, references auth.users)

  ## Security
  - Enable RLS on both tables
  - Association admins can view and manage their fee structures
*/

-- Create state_association_club_fees table
CREATE TABLE IF NOT EXISTS state_association_club_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_association_id uuid NOT NULL REFERENCES state_associations(id) ON DELETE CASCADE,
  club_fee_amount numeric(10,2) NOT NULL CHECK (club_fee_amount >= 0),
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT valid_date_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Create national_association_state_fees table
CREATE TABLE IF NOT EXISTS national_association_state_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_association_id uuid NOT NULL REFERENCES national_associations(id) ON DELETE CASCADE,
  state_fee_amount numeric(10,2) NOT NULL CHECK (state_fee_amount >= 0),
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT valid_date_range_national CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_state_club_fees_state_id ON state_association_club_fees(state_association_id);
CREATE INDEX IF NOT EXISTS idx_state_club_fees_effective_dates ON state_association_club_fees(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_national_state_fees_national_id ON national_association_state_fees(national_association_id);
CREATE INDEX IF NOT EXISTS idx_national_state_fees_effective_dates ON national_association_state_fees(effective_from, effective_to);

-- Enable RLS
ALTER TABLE state_association_club_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE national_association_state_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies for state_association_club_fees

-- State association admins can view their fee structures
CREATE POLICY "State admins can view club fees"
  ON state_association_club_fees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );

-- State association admins can create fee structures
CREATE POLICY "State admins can create club fees"
  ON state_association_club_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );

-- State association admins can update their fee structures
CREATE POLICY "State admins can update club fees"
  ON state_association_club_fees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );

-- State association admins can delete their fee structures
CREATE POLICY "State admins can delete club fees"
  ON state_association_club_fees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );

-- RLS Policies for national_association_state_fees

-- National association admins can view their fee structures
CREATE POLICY "National admins can view state fees"
  ON national_association_state_fees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'admin'
    )
  );

-- National association admins can create fee structures
CREATE POLICY "National admins can create state fees"
  ON national_association_state_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'admin'
    )
  );

-- National association admins can update their fee structures
CREATE POLICY "National admins can update state fees"
  ON national_association_state_fees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'admin'
    )
  );

-- National association admins can delete their fee structures
CREATE POLICY "National admins can delete state fees"
  ON national_association_state_fees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'admin'
    )
  );