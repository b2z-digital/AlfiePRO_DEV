/*
  # Create National Associations Tables

  1. New Tables
    - national_associations: National-level associations (e.g., Australian Radio Yachting Association)
    - user_national_associations: Junction table linking users to national associations with roles

  2. Columns
    national_associations:
      - id, name, short_name, abn
      - description, logo_url, cover_image_url
      - contact info (email, phone, website, address)
      - stripe_account_id, subscription details
      - timestamps

    user_national_associations:
      - user_id, national_association_id, role
      - timestamps

  3. Security
    - Enable RLS on both tables
    - National admins and super admins can access their associations
    - Proper role-based access control
*/

-- Create national_associations table
CREATE TABLE IF NOT EXISTS national_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
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

-- Create user_national_associations junction table
CREATE TABLE IF NOT EXISTS user_national_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  national_association_id UUID NOT NULL REFERENCES national_associations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, national_association_id)
);

-- Enable RLS on national_associations
ALTER TABLE national_associations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_national_associations
ALTER TABLE user_national_associations ENABLE ROW LEVEL SECURITY;

-- Policies for national_associations

-- Super admins can view all national associations
CREATE POLICY "Super admins can view all national associations"
  ON national_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- National admins and members can view their associations
CREATE POLICY "National members can view their associations"
  ON national_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = national_associations.id
      AND una.user_id = auth.uid()
    )
  );

-- Super admins can insert national associations
CREATE POLICY "Super admins can insert national associations"
  ON national_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Super admins and national admins can update associations
CREATE POLICY "Super admins and national admins can update associations"
  ON national_associations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = national_associations.id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = national_associations.id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

-- Super admins can delete national associations
CREATE POLICY "Super admins can delete national associations"
  ON national_associations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policies for user_national_associations

-- Users can view their own national association memberships
CREATE POLICY "Users can view their own national associations"
  ON user_national_associations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Super admins can view all user-national associations
CREATE POLICY "Super admins can view all user national associations"
  ON user_national_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- National admins can view members of their associations
CREATE POLICY "National admins can view their association members"
  ON user_national_associations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una2
      WHERE una2.national_association_id = user_national_associations.national_association_id
      AND una2.user_id = auth.uid()
      AND una2.role = 'national_admin'
    )
  );

-- Super admins can insert user-national associations
CREATE POLICY "Super admins can add users to national associations"
  ON user_national_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- National admins can add users to their associations
CREATE POLICY "National admins can add users to their associations"
  ON user_national_associations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_national_associations una2
      WHERE una2.national_association_id = user_national_associations.national_association_id
      AND una2.user_id = auth.uid()
      AND una2.role = 'national_admin'
    )
  );

-- Super admins and national admins can update roles
CREATE POLICY "Super admins and national admins can update roles"
  ON user_national_associations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_national_associations una2
      WHERE una2.national_association_id = user_national_associations.national_association_id
      AND una2.user_id = auth.uid()
      AND una2.role = 'national_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_national_associations una2
      WHERE una2.national_association_id = user_national_associations.national_association_id
      AND una2.user_id = auth.uid()
      AND una2.role = 'national_admin'
    )
  );

-- Super admins and national admins can delete associations
CREATE POLICY "Super admins and national admins can remove users"
  ON user_national_associations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_national_associations una2
      WHERE una2.national_association_id = user_national_associations.national_association_id
      AND una2.user_id = auth.uid()
      AND una2.role = 'national_admin'
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_national_associations_subscription 
ON national_associations(subscription_status);

CREATE INDEX IF NOT EXISTS idx_user_national_associations_user 
ON user_national_associations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_national_associations_association 
ON user_national_associations(national_association_id);

CREATE INDEX IF NOT EXISTS idx_user_national_associations_role 
ON user_national_associations(role);