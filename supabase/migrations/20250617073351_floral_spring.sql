/*
  # Membership Management Schema
  
  1. New Tables
    - `membership_types` - Stores different membership options for clubs
    - `membership_renewals` - Tracks membership renewal history
    - `membership_payments` - Records payment transactions for memberships
    
  2. Changes to Existing Tables
    - Add renewal settings to `clubs` table
    - Add user_id and renewal_date to `members` table
    
  3. Security
    - Enable RLS on all new tables
    - Add policies for member and admin access
*/

-- Add renewal settings to clubs table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'renewal_mode'
  ) THEN
    ALTER TABLE clubs ADD COLUMN renewal_mode TEXT DEFAULT 'anniversary'::text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'fixed_renewal_date'
  ) THEN
    ALTER TABLE clubs ADD COLUMN fixed_renewal_date TEXT;
  END IF;
END $$;

-- Add constraint to ensure renewal_mode is valid, only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'clubs_renewal_mode_check' AND conrelid = 'clubs'::regclass
  ) THEN
    ALTER TABLE clubs
    ADD CONSTRAINT clubs_renewal_mode_check
    CHECK (renewal_mode = ANY (ARRAY['anniversary'::text, 'fixed'::text]));
  END IF;
END $$;

-- Add user_id to members table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE members ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Add renewal_date to members table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'renewal_date'
  ) THEN
    ALTER TABLE members ADD COLUMN renewal_date DATE;
  END IF;
END $$;

-- Create membership_types table
CREATE TABLE IF NOT EXISTS membership_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD'::text,
  renewal_period TEXT NOT NULL DEFAULT 'annual'::text,
  is_active BOOLEAN NOT NULL DEFAULT true,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create membership_renewals table
CREATE TABLE IF NOT EXISTS membership_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_type_id UUID NOT NULL REFERENCES membership_types(id),
  renewal_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  amount_paid NUMERIC NOT NULL,
  payment_method TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create membership_payments table
CREATE TABLE IF NOT EXISTS membership_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_type_id UUID NOT NULL REFERENCES membership_types(id),
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD'::text,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  payment_method TEXT,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create triggers for updated_at columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_membership_types_updated_at'
  ) THEN
    CREATE TRIGGER update_membership_types_updated_at
    BEFORE UPDATE ON membership_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_membership_renewals_updated_at'
  ) THEN
    CREATE TRIGGER update_membership_renewals_updated_at
    BEFORE UPDATE ON membership_renewals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_membership_payments_updated_at'
  ) THEN
    CREATE TRIGGER update_membership_payments_updated_at
    BEFORE UPDATE ON membership_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE membership_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public can view membership types" ON membership_types;
  DROP POLICY IF EXISTS "Club admins can manage membership types" ON membership_types;
  DROP POLICY IF EXISTS "Club admins can view all renewals" ON membership_renewals;
  DROP POLICY IF EXISTS "Members can view their own renewals" ON membership_renewals;
  DROP POLICY IF EXISTS "Club admins can manage renewals" ON membership_renewals;
  DROP POLICY IF EXISTS "Club admins can view all payments" ON membership_payments;
  DROP POLICY IF EXISTS "Members can view their own payments" ON membership_payments;
  DROP POLICY IF EXISTS "Club admins can manage payments" ON membership_payments;
  DROP POLICY IF EXISTS "Members can view and update their own profile" ON members;
  DROP POLICY IF EXISTS "Members can update their own profile" ON members;
END $$;

-- RLS Policies for membership_types
CREATE POLICY "Public can view membership types"
ON membership_types
FOR SELECT
TO public
USING (true);

CREATE POLICY "Club admins can manage membership types"
ON membership_types
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = membership_types.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'::club_role
  )
);

-- RLS Policies for membership_renewals
CREATE POLICY "Club admins can view all renewals"
ON membership_renewals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM members m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = membership_renewals.member_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'::club_role
  )
);

CREATE POLICY "Members can view their own renewals"
ON membership_renewals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = membership_renewals.member_id
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Club admins can manage renewals"
ON membership_renewals
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM members m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = membership_renewals.member_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'::club_role
  )
);

-- RLS Policies for membership_payments
CREATE POLICY "Club admins can view all payments"
ON membership_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM members m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = membership_payments.member_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'::club_role
  )
);

CREATE POLICY "Members can view their own payments"
ON membership_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = membership_payments.member_id
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Club admins can manage payments"
ON membership_payments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM members m
    JOIN user_clubs uc ON m.club_id = uc.club_id
    WHERE m.id = membership_payments.member_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'::club_role
  )
);

-- Update RLS policies for members
CREATE POLICY "Members can view and update their own profile"
ON members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Members can update their own profile"
ON members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());