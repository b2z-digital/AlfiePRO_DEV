-- Add bank details columns to clubs table
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bsb text;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS account_number text;

-- Set default values for existing clubs
UPDATE clubs 
SET 
  bank_name = 'Greater Bank',
  bsb = '637-000',
  account_number = '723 940 842'
WHERE bank_name IS NULL;

-- Create or replace function to handle Stripe connection
CREATE OR REPLACE FUNCTION handle_stripe_connection()
RETURNS trigger AS $$
BEGIN
  -- This function will be called when a Stripe connection is established
  -- For now, it's just a placeholder
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a table to store Stripe connection details
CREATE TABLE IF NOT EXISTS stripe_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL,
  connected_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(club_id)
);

-- Enable RLS on stripe_connections
ALTER TABLE stripe_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for stripe_connections
CREATE POLICY "Club admins can view their stripe connections"
  ON stripe_connections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = stripe_connections.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

CREATE POLICY "Club admins can manage their stripe connections"
  ON stripe_connections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = stripe_connections.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = stripe_connections.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );