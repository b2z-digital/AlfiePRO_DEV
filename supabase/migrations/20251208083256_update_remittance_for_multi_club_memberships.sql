/*
  # Update Remittance System for Multi-Club Memberships

  1. Changes
    - Update remittance trigger to check club_memberships table
    - Only create remittances for primary memberships (pays_association_fees = true)
    - Skip affiliate/guest memberships to avoid duplicate association fees

  2. Smart Fee Routing
    - Primary memberships: Full fees including association fees
    - Affiliate memberships: Club fees only, no association fees
    - Prevents double-charging when members belong to multiple clubs
*/

-- Drop old trigger
DROP TRIGGER IF EXISTS trigger_create_remittance_for_membership ON members;
DROP FUNCTION IF EXISTS create_remittance_for_membership();

-- Create new trigger function that checks club_memberships
CREATE OR REPLACE FUNCTION create_remittance_for_membership_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club record;
  v_state_association record;
  v_remittance_id uuid;
  v_state_fee numeric;
  v_national_fee numeric;
  v_total_fee numeric;
  v_membership_relationship text;
BEGIN
  -- Only process if this is a paid membership
  IF NEW.is_financial != true THEN
    RETURN NEW;
  END IF;

  -- Check if user has a club_membership record and what type it is
  SELECT relationship_type, pays_association_fees
  INTO v_membership_relationship
  FROM club_memberships
  WHERE member_id = NEW.user_id
  AND club_id = NEW.club_id
  AND status = 'active';

  -- Only create remittances for primary memberships that pay association fees
  IF v_membership_relationship IS NULL OR v_membership_relationship != 'primary' THEN
    RETURN NEW;
  END IF;

  -- Get club details
  SELECT * INTO v_club
  FROM clubs
  WHERE id = NEW.club_id;

  IF v_club IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only proceed if club has cascade fees enabled
  IF v_club.enable_cascade_fees != true THEN
    RETURN NEW;
  END IF;

  -- Get state association and fees
  IF v_club.state_association_id IS NOT NULL THEN
    SELECT * INTO v_state_association
    FROM state_associations
    WHERE id = v_club.state_association_id;

    v_state_fee := COALESCE(v_state_association.state_fee_per_member, 0);
    v_national_fee := COALESCE(v_state_association.national_fee_per_member, 0);
    v_total_fee := v_state_fee + v_national_fee;

    -- Only create remittance if there are fees
    IF v_total_fee > 0 THEN
      -- Check if remittance already exists for this member/period
      IF NOT EXISTS (
        SELECT 1 FROM membership_remittances
        WHERE member_id = NEW.id
        AND club_id = NEW.club_id
        AND status != 'cancelled'
      ) THEN
        -- Create remittance record
        INSERT INTO membership_remittances (
          member_id,
          club_id,
          member_name,
          club_name,
          state_association_id,
          state_fee_amount,
          national_fee_amount,
          total_fee_amount,
          payment_status,
          due_date,
          is_bulk_payment
        ) VALUES (
          NEW.id,
          NEW.club_id,
          CONCAT(NEW.first_name, ' ', NEW.last_name),
          v_club.name,
          v_club.state_association_id,
          v_state_fee,
          v_national_fee,
          v_total_fee,
          'unpaid',
          CURRENT_DATE + INTERVAL '30 days',
          false
        )
        RETURNING id INTO v_remittance_id;

        -- Create corresponding association transaction
        IF v_state_fee > 0 THEN
          INSERT INTO association_transactions (
            association_id,
            association_type,
            category_id,
            description,
            amount,
            transaction_type,
            transaction_date,
            payment_method,
            payment_status,
            linked_entity_type,
            linked_entity_id,
            club_id,
            club_name,
            created_by
          )
          SELECT
            v_club.state_association_id,
            'state',
            (SELECT id FROM association_budget_categories WHERE association_id = v_club.state_association_id AND name = 'Membership Fees' LIMIT 1),
            'Membership fee for ' || CONCAT(NEW.first_name, ' ', NEW.last_name) || ' via ' || v_club.name,
            v_state_fee,
            'deposit',
            CURRENT_DATE,
            'bank_transfer',
            'pending',
            'remittance',
            v_remittance_id,
            NEW.club_id,
            v_club.name,
            NEW.user_id;
        END IF;

        IF v_national_fee > 0 AND v_state_association.national_association_id IS NOT NULL THEN
          INSERT INTO association_transactions (
            association_id,
            association_type,
            category_id,
            description,
            amount,
            transaction_type,
            transaction_date,
            payment_method,
            payment_status,
            linked_entity_type,
            linked_entity_id,
            club_id,
            club_name,
            created_by
          )
          SELECT
            v_state_association.national_association_id,
            'national',
            (SELECT id FROM association_budget_categories WHERE association_id = v_state_association.national_association_id AND name = 'Membership Fees' LIMIT 1),
            'Membership fee for ' || CONCAT(NEW.first_name, ' ', NEW.last_name) || ' via ' || v_club.name,
            v_national_fee,
            'deposit',
            CURRENT_DATE,
            'bank_transfer',
            'pending',
            'remittance',
            v_remittance_id,
            NEW.club_id,
            v_club.name,
            NEW.user_id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER trigger_create_remittance_for_membership
  AFTER INSERT OR UPDATE ON members
  FOR EACH ROW
  WHEN (NEW.is_financial = true)
  EXECUTE FUNCTION create_remittance_for_membership_v2();

-- Add comment
COMMENT ON FUNCTION create_remittance_for_membership_v2() IS 
'Updated to support multi-club memberships. Only creates remittances for primary memberships where pays_association_fees is true.';
