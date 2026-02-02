/*
  # Membership Management System
  
  1. New Tables
    - `membership_types` - Stores different membership types for each club
    - `membership_renewals` - Tracks renewal history
    - `membership_payments` - Records payment transactions
    
  2. Changes to Existing Tables
    - Add `user_id` to `members` table to link with auth users
    - Add `renewal_date` to `members` table
    - Add `code_of_conduct` to `clubs` table
    - Update `club_role` enum to include 'member' role
    
  3. Security
    - Update RLS policies for proper access control
*/

-- Update club_role enum to include 'member' role if it doesn't exist
DO $$ 
BEGIN
  -- Check if 'member' exists in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'member' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'club_role')
  ) THEN
    -- Add 'member' to the enum
    ALTER TYPE club_role ADD VALUE 'member';
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

-- Add code_of_conduct to clubs table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'code_of_conduct'
  ) THEN
    ALTER TABLE clubs ADD COLUMN code_of_conduct TEXT;
  END IF;
END $$;

-- Create membership_types table if it doesn't exist
CREATE TABLE IF NOT EXISTS membership_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD',
  renewal_period TEXT NOT NULL DEFAULT 'annual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create membership_renewals table if it doesn't exist
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

-- Create membership_payments table if it doesn't exist
CREATE TABLE IF NOT EXISTS membership_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_type_id UUID NOT NULL REFERENCES membership_types(id),
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create triggers for updated_at columns
CREATE TRIGGER update_membership_types_updated_at
BEFORE UPDATE ON membership_types
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_membership_renewals_updated_at
BEFORE UPDATE ON membership_renewals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_membership_payments_updated_at
BEFORE UPDATE ON membership_payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on new tables
ALTER TABLE membership_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_payments ENABLE ROW LEVEL SECURITY;

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
    AND uc.role = 'admin'
  )
);

-- RLS Policies for membership_renewals
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
    AND uc.role = 'admin'
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
    AND uc.role = 'admin'
  )
);

-- RLS Policies for membership_payments
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
    AND uc.role = 'admin'
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
    AND uc.role = 'admin'
  )
);

-- Update RLS policies for members table to include member role
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

-- Create function to check if renewal is needed
CREATE OR REPLACE FUNCTION check_membership_renewal(member_id uuid)
RETURNS boolean AS $$
DECLARE
  renewal_needed boolean;
BEGIN
  SELECT 
    CASE 
      WHEN renewal_date IS NULL THEN false
      WHEN renewal_date <= (CURRENT_DATE + interval '30 days') THEN true
      ELSE false
    END INTO renewal_needed
  FROM members
  WHERE id = member_id;
  
  RETURN renewal_needed;
END;
$$ LANGUAGE plpgsql;