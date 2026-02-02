/*
  # Create State Associations Tables

  1. New Tables
    - state_associations: State-level associations (e.g., NSW Radio Yachting Association)
    - user_state_associations: Junction table linking users to state associations with roles

  2. Columns
    state_associations:
      - id, name, short_name, state, abn
      - description, logo_url, cover_image_url
      - contact info (email, phone, website, address)
      - stripe_account_id, subscription details
      - timestamps

    user_state_associations:
      - user_id, state_association_id, role
      - timestamps

  3. Security
    - Enable RLS on both tables
    - State admins and super admins can access their associations
    - Proper role-based access control
*/

-- Create state_associations table
CREATE TABLE IF NOT EXISTS state_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  state TEXT NOT NULL,
  abn TEXT,
  description TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'Australia',
  stripe_account_id TEXT,
  subscription_tier TEXT,
  subscription_status TEXT DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_state_associations junction table
CREATE TABLE IF NOT EXISTS user_state_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_association_id UUID NOT NULL REFERENCES state_associations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, state_association_id)
);

-- Enable RLS on state_associations
ALTER TABLE state_associations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_state_associations
ALTER TABLE user_state_associations ENABLE ROW LEVEL SECURITY;

-- Policies for state_associations

-- Super admins can view all state associations
CREATE POLICY "Super admins can view all state associations"
  ON state_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- State admins and members can view their associations
CREATE POLICY "State members can view their associations"
  ON state_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = state_associations.id
      AND usa.user_id = auth.uid()
    )
  );

-- Super admins can insert state associations
CREATE POLICY "Super admins can insert state associations"
  ON state_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Super admins and state admins can update associations
CREATE POLICY "Super admins and state admins can update associations"
  ON state_associations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = state_associations.id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = state_associations.id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- Super admins can delete state associations
CREATE POLICY "Super admins can delete state associations"
  ON state_associations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policies for user_state_associations

-- Users can view their own state association memberships
CREATE POLICY "Users can view their own state associations"
  ON user_state_associations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Super admins can view all user-state associations
CREATE POLICY "Super admins can view all user state associations"
  ON user_state_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- State admins can view members of their associations
CREATE POLICY "State admins can view their association members"
  ON user_state_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa2
      WHERE usa2.state_association_id = user_state_associations.state_association_id
      AND usa2.user_id = auth.uid()
      AND usa2.role = 'state_admin'
    )
  );

-- Super admins can insert user-state associations
CREATE POLICY "Super admins can add users to state associations"
  ON user_state_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- State admins can add users to their associations
CREATE POLICY "State admins can add users to their associations"
  ON user_state_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_state_associations usa2
      WHERE usa2.state_association_id = user_state_associations.state_association_id
      AND usa2.user_id = auth.uid()
      AND usa2.role = 'state_admin'
    )
  );

-- Super admins and state admins can update roles
CREATE POLICY "Super admins and state admins can update roles"
  ON user_state_associations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_state_associations usa2
      WHERE usa2.state_association_id = user_state_associations.state_association_id
      AND usa2.user_id = auth.uid()
      AND usa2.role = 'state_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_state_associations usa2
      WHERE usa2.state_association_id = user_state_associations.state_association_id
      AND usa2.user_id = auth.uid()
      AND usa2.role = 'state_admin'
    )
  );

-- Super admins and state admins can delete associations
CREATE POLICY "Super admins and state admins can remove users"
  ON user_state_associations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_state_associations usa2
      WHERE usa2.state_association_id = user_state_associations.state_association_id
      AND usa2.user_id = auth.uid()
      AND usa2.role = 'state_admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_state_associations_state 
ON state_associations(state);

CREATE INDEX IF NOT EXISTS idx_state_associations_subscription 
ON state_associations(subscription_status);

CREATE INDEX IF NOT EXISTS idx_user_state_associations_user 
ON user_state_associations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_state_associations_association 
ON user_state_associations(state_association_id);

CREATE INDEX IF NOT EXISTS idx_user_state_associations_role 
ON user_state_associations(role);