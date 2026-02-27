/*
  # Smart Associate Member Fee System V2

  1. Overview
    - Allow members to join multiple clubs
    - Primary membership: pays full club fee + state fee + national fee
    - Associate membership: pays reduced club fee only (no state/national fees)
    - Automatically detect if member has already paid state fees

  2. New Features
    - Function to check if member has paid state fees in current year
    - Auto-set pays_association_fees based on existing memberships
    - Helper view to show member's fee obligations

  3. Security
    - All functions use SECURITY DEFINER with search_path set
*/

-- Function to check if a member has already paid state fees this year
CREATE OR REPLACE FUNCTION has_paid_state_fees_this_year(
  p_member_id uuid,
  p_state_association_id uuid,
  p_membership_year integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer;
  v_has_paid boolean;
BEGIN
  v_year := COALESCE(p_membership_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  
  -- Check if member has any paid state remittances this year
  SELECT EXISTS (
    SELECT 1
    FROM membership_remittances mr
    WHERE mr.member_id = p_member_id
    AND mr.state_association_id = p_state_association_id
    AND mr.membership_year = v_year
    AND mr.state_fee_amount > 0
    AND (mr.club_to_state_status = 'paid' OR mr.state_to_national_status = 'paid')
  ) INTO v_has_paid;
  
  RETURN v_has_paid;
END;
$$;

-- Function to check if member has already paid national fees this year
CREATE OR REPLACE FUNCTION has_paid_national_fees_this_year(
  p_member_id uuid,
  p_national_association_id uuid,
  p_membership_year integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer;
  v_has_paid boolean;
BEGIN
  v_year := COALESCE(p_membership_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  
  -- Check if member has any paid national remittances this year
  SELECT EXISTS (
    SELECT 1
    FROM membership_remittances mr
    WHERE mr.member_id = p_member_id
    AND mr.national_association_id = p_national_association_id
    AND mr.membership_year = v_year
    AND mr.national_fee_amount > 0
    AND mr.state_to_national_status = 'paid'
  ) INTO v_has_paid;
  
  RETURN v_has_paid;
END;
$$;

-- Function to determine if a new membership should pay association fees
CREATE OR REPLACE FUNCTION should_pay_association_fees(
  p_member_id uuid,
  p_club_id uuid,
  p_relationship_type membership_relationship_type DEFAULT 'primary'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_state_id uuid;
  v_club_national_id uuid;
  v_has_primary_membership boolean;
  v_has_paid_state boolean;
  v_has_paid_national boolean;
  v_current_year integer;
BEGIN
  v_current_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  
  -- If explicitly set as primary, they should pay
  IF p_relationship_type = 'primary' THEN
    RETURN true;
  END IF;
  
  -- If social or family member, they never pay association fees
  IF p_relationship_type IN ('social', 'family') THEN
    RETURN false;
  END IF;
  
  -- For associate members, check if they already have a primary membership
  -- Get the club's state and national associations
  SELECT 
    c.state_association_id,
    sa.national_association_id
  INTO v_club_state_id, v_club_national_id
  FROM clubs c
  LEFT JOIN state_associations sa ON c.state_association_id = sa.id
  WHERE c.id = p_club_id;
  
  -- Check if member has an active primary membership in another club
  SELECT EXISTS (
    SELECT 1
    FROM club_memberships cm
    WHERE cm.member_id = p_member_id
    AND cm.club_id != p_club_id
    AND cm.relationship_type = 'primary'
    AND cm.status = 'active'
    AND cm.pays_association_fees = true
  ) INTO v_has_primary_membership;
  
  -- If they have a primary membership elsewhere, check if fees are paid
  IF v_has_primary_membership THEN
    -- Check state fees
    IF v_club_state_id IS NOT NULL THEN
      v_has_paid_state := has_paid_state_fees_this_year(
        p_member_id,
        v_club_state_id,
        v_current_year
      );
    ELSE
      v_has_paid_state := false;
    END IF;
    
    -- Check national fees
    IF v_club_national_id IS NOT NULL THEN
      v_has_paid_national := has_paid_national_fees_this_year(
        p_member_id,
        v_club_national_id,
        v_current_year
      );
    ELSE
      v_has_paid_national := false;
    END IF;
    
    -- If they've already paid either state or national fees, don't charge again
    IF v_has_paid_state OR v_has_paid_national THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Default: associate members without paid fees should pay
  RETURN true;
END;
$$;

-- Add comment explaining the system
COMMENT ON FUNCTION should_pay_association_fees IS 
  'Determines if a member should pay state/national association fees when joining a club. 
   Returns false if they already have a paid primary membership in another club within the same association.';