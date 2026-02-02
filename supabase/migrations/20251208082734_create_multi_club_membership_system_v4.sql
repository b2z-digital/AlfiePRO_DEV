/*
  # Multi-Club Membership System - Phase 1: Core Schema

  1. New Tables
    - `club_memberships`: Links members to clubs with relationship types
    - `member_claims`: Manages member claiming/invitation workflows
    - `member_match_suggestions`: Smart matching for duplicate prevention

  2. Profile Enhancements
    - Global member tracking fields

  3. Security
    - RLS policies for cross-club visibility with proper hierarchy

  4. Backward Compatibility
    - Existing members table stays intact
*/

-- Add global member tracking fields to profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'member_number'
  ) THEN
    ALTER TABLE profiles ADD COLUMN member_number text UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_profiles_member_number ON profiles(member_number);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'primary_club_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN primary_club_id uuid REFERENCES clubs(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_profiles_primary_club ON profiles(primary_club_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'registration_source'
  ) THEN
    ALTER TABLE profiles ADD COLUMN registration_source text DEFAULT 'direct' CHECK (registration_source IN ('direct', 'club_invite', 'association_import', 'member_request'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_multi_club_member'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_multi_club_member boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'nationality'
  ) THEN
    ALTER TABLE profiles ADD COLUMN nationality text;
  END IF;
END $$;

-- Create relationship type enum
DO $$ BEGIN
  CREATE TYPE membership_relationship_type AS ENUM (
    'primary',
    'affiliate', 
    'guest',
    'honorary'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create claim type enum
DO $$ BEGIN
  CREATE TYPE member_claim_type AS ENUM (
    'association_import',
    'club_invite',
    'member_request'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create claim status enum
DO $$ BEGIN
  CREATE TYPE member_claim_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create club_memberships table (core of multi-club system)
CREATE TABLE IF NOT EXISTS club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  membership_type_id uuid REFERENCES membership_types(id) ON DELETE SET NULL,
  
  -- Relationship type determines fee structure
  relationship_type membership_relationship_type NOT NULL DEFAULT 'primary',
  
  -- Status tracking
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'expired', 'archived')),
  
  -- Dates
  joined_date timestamptz DEFAULT now(),
  expiry_date timestamptz,
  
  -- Payment tracking
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial', 'overdue')),
  annual_fee_amount numeric(10,2),
  
  -- Association fee routing - only primary memberships pay association fees
  pays_association_fees boolean DEFAULT true,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  
  -- Ensure one relationship per member per club
  CONSTRAINT unique_member_club UNIQUE (member_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_club_memberships_member ON club_memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_club ON club_memberships(club_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_status ON club_memberships(status);
CREATE INDEX IF NOT EXISTS idx_club_memberships_relationship ON club_memberships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_club_memberships_expiry ON club_memberships(expiry_date);

-- Create member_claims table (for claiming/invitation workflow)
CREATE TABLE IF NOT EXISTS member_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The member being claimed (may not exist yet if new)
  member_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- For new members, store their details temporarily
  email text,
  full_name text,
  date_of_birth date,
  phone text,
  
  -- Which club is claiming/inviting
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  
  -- If this member was imported by an association
  association_id uuid,
  association_type text CHECK (association_type IN ('state', 'national')),
  
  -- Who initiated the claim
  invited_by_user_id uuid REFERENCES profiles(id),
  invited_by_club_id uuid REFERENCES clubs(id),
  
  -- Type of claim
  claim_type member_claim_type NOT NULL,
  
  -- Status
  status member_claim_status NOT NULL DEFAULT 'pending',
  
  -- What membership will they get
  membership_type_id uuid REFERENCES membership_types(id),
  relationship_type membership_relationship_type NOT NULL DEFAULT 'primary',
  
  -- Match confidence (for association imports)
  match_confidence numeric(3,2), -- 0.00 to 1.00
  match_reasons text[],
  
  -- Admin notes and decisions
  admin_notes text,
  rejection_reason text,
  
  -- Expiry for claims
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_member_claims_member ON member_claims(member_id);
CREATE INDEX IF NOT EXISTS idx_member_claims_club ON member_claims(club_id);
CREATE INDEX IF NOT EXISTS idx_member_claims_status ON member_claims(status);
CREATE INDEX IF NOT EXISTS idx_member_claims_email ON member_claims(email);
CREATE INDEX IF NOT EXISTS idx_member_claims_association ON member_claims(association_id);

-- Create member_match_suggestions table (smart duplicate prevention)
CREATE TABLE IF NOT EXISTS member_match_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The claim or new profile being matched
  claim_id uuid REFERENCES member_claims(id) ON DELETE CASCADE,
  new_profile_email text,
  
  -- Potential matching existing member
  suggested_member_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Match scoring
  confidence_score numeric(3,2), -- 0.00 to 1.00
  match_type text CHECK (match_type IN ('email_exact', 'email_similar', 'name_dob', 'phone', 'member_number')),
  match_details jsonb,
  
  -- Review status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed_match', 'confirmed_different', 'ignored')),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_suggestions_claim ON member_match_suggestions(claim_id);
CREATE INDEX IF NOT EXISTS idx_match_suggestions_member ON member_match_suggestions(suggested_member_id);
CREATE INDEX IF NOT EXISTS idx_match_suggestions_status ON member_match_suggestions(status);

-- Enable RLS
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_match_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for club_memberships
-- Members can view their own memberships across all clubs
CREATE POLICY "Members can view own memberships"
  ON club_memberships FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);

-- Club admins can view memberships in their club
CREATE POLICY "Club admins can view their club memberships"
  ON club_memberships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_memberships.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- State association admins can view memberships in their clubs
CREATE POLICY "State admins can view memberships"
  ON club_memberships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN user_state_associations usa ON usa.state_association_id = c.state_association_id
      WHERE c.id = club_memberships.club_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
  );

-- National association admins can view memberships via state associations
CREATE POLICY "National admins can view memberships"
  ON club_memberships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN state_associations sa ON sa.id = c.state_association_id
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE c.id = club_memberships.club_id
      AND una.user_id = auth.uid()
      AND una.role = 'admin'
    )
  );

-- Club admins can create memberships in their club
CREATE POLICY "Club admins can create memberships"
  ON club_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_memberships.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Club admins can update memberships in their club
CREATE POLICY "Club admins can update memberships"
  ON club_memberships FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_memberships.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Members can update their own membership preferences
CREATE POLICY "Members can update own membership preferences"
  ON club_memberships FOR UPDATE
  TO authenticated
  USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

-- Club admins can delete memberships
CREATE POLICY "Club admins can delete memberships"
  ON club_memberships FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_memberships.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for member_claims
-- Club admins can view claims for their club
CREATE POLICY "Club admins can view claims for their club"
  ON member_claims FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = member_claims.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- State association admins can view claims
CREATE POLICY "State admins can view claims"
  ON member_claims FOR SELECT
  TO authenticated
  USING (
    association_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE state_association_id = member_claims.association_id
      AND user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- National association admins can view claims
CREATE POLICY "National admins can view claims"
  ON member_claims FOR SELECT
  TO authenticated
  USING (
    association_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE national_association_id = member_claims.association_id
      AND user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Members can view claims about them
CREATE POLICY "Members can view claims about themselves"
  ON member_claims FOR SELECT
  TO authenticated
  USING (member_id = auth.uid() OR email = (SELECT email FROM profiles WHERE id = auth.uid()));

-- Club and association admins can create claims
CREATE POLICY "Admins can create claims"
  ON member_claims FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = member_claims.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
    OR
    (association_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE state_association_id = member_claims.association_id
      AND user_id = auth.uid()
      AND role = 'admin'
    ))
    OR
    (association_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE national_association_id = member_claims.association_id
      AND user_id = auth.uid()
      AND role = 'admin'
    ))
  );

-- Admins can update claims
CREATE POLICY "Admins can update claims"
  ON member_claims FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = member_claims.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
    OR
    (association_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE state_association_id = member_claims.association_id
      AND user_id = auth.uid()
      AND role = 'admin'
    ))
  );

-- RLS Policies for member_match_suggestions
-- Only admins can see match suggestions
CREATE POLICY "Admins can view match suggestions"
  ON member_match_suggestions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_claims mc
      JOIN user_clubs uc ON uc.club_id = mc.club_id
      WHERE mc.id = member_match_suggestions.claim_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

CREATE POLICY "Admins can update match suggestions"
  ON member_match_suggestions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_claims mc
      JOIN user_clubs uc ON uc.club_id = mc.club_id
      WHERE mc.id = member_match_suggestions.claim_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert match suggestions"
  ON member_match_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_claims mc
      JOIN user_clubs uc ON uc.club_id = mc.club_id
      WHERE mc.id = member_match_suggestions.claim_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Function to generate global member numbers
CREATE OR REPLACE FUNCTION generate_member_number(
  p_country_code text DEFAULT 'AUS',
  p_association_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence_num integer;
  v_member_number text;
BEGIN
  -- Get next sequence number for this country/association
  SELECT COALESCE(MAX(
    CAST(
      REGEXP_REPLACE(member_number, '[^0-9]', '', 'g') AS integer
    )
  ), 0) + 1
  INTO v_sequence_num
  FROM profiles
  WHERE member_number LIKE p_country_code || '-%';
  
  -- Format: AUS-00001, USA-00001, etc.
  v_member_number := p_country_code || '-' || LPAD(v_sequence_num::text, 5, '0');
  
  RETURN v_member_number;
END;
$$;

-- Function to update multi-club member flag
CREATE OR REPLACE FUNCTION update_multi_club_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the is_multi_club_member flag
  UPDATE profiles
  SET is_multi_club_member = (
    SELECT COUNT(*) > 1
    FROM club_memberships
    WHERE member_id = COALESCE(NEW.member_id, OLD.member_id)
    AND status = 'active'
  )
  WHERE id = COALESCE(NEW.member_id, OLD.member_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to maintain multi-club flag
DROP TRIGGER IF EXISTS trigger_update_multi_club_flag ON club_memberships;
CREATE TRIGGER trigger_update_multi_club_flag
  AFTER INSERT OR UPDATE OR DELETE ON club_memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_multi_club_flag();

-- Function to auto-set primary club
CREATE OR REPLACE FUNCTION set_primary_club()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If this is their first primary membership, set it as primary club
  IF NEW.relationship_type = 'primary' THEN
    UPDATE profiles
    SET primary_club_id = NEW.club_id
    WHERE id = NEW.member_id
    AND (primary_club_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM club_memberships
      WHERE member_id = NEW.member_id
      AND relationship_type = 'primary'
      AND status = 'active'
      AND id != NEW.id
    ));
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to set primary club
DROP TRIGGER IF EXISTS trigger_set_primary_club ON club_memberships;
CREATE TRIGGER trigger_set_primary_club
  AFTER INSERT OR UPDATE ON club_memberships
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION set_primary_club();
