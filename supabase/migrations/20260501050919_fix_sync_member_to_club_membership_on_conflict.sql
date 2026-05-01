/*
  # Fix sync_member_to_club_membership to use ON CONFLICT

  1. Problem
    - The trigger checks for existing club_memberships with relationship_type = 'primary'
    - But the unique constraint is on (member_id, club_id) regardless of relationship_type
    - If a non-primary entry exists (e.g., from state admin sync or affiliate membership),
      the INSERT fails with a constraint violation
    - This causes errors like "unique_member_club" or "user_clubs_relationship" when
      state admins try to join additional clubs

  2. Fix
    - Replace conditional INSERT with INSERT ... ON CONFLICT (member_id, club_id) DO UPDATE
    - This safely handles all cases: no existing row, existing primary row, existing non-primary row
    - On conflict, updates the existing row to primary status with latest member data
    - Preserves the two-step check for UPDATE (only updates if values actually changed)

  3. Impact
    - State admins who already have club_memberships entries from sync won't hit constraint errors
    - Members joining clubs through any path are protected from duplicate key violations
    - Existing behavior preserved: updates happen only when data differs
*/

CREATE OR REPLACE FUNCTION sync_member_to_club_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_status text;
  v_new_payment_status text;
  v_membership_type_id uuid;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.membership_status = 'archived' THEN
    RETURN NEW;
  END IF;

  v_new_status := CASE
    WHEN NEW.membership_status = 'active' THEN 'active'
    WHEN NEW.membership_status = 'expired' THEN 'expired'
    WHEN NEW.membership_status = 'pending' THEN 'pending'
    ELSE 'active'
  END;

  v_new_payment_status := CASE
    WHEN NEW.is_financial = true THEN 'paid'
    WHEN NEW.payment_status = 'paid' THEN 'paid'
    WHEN NEW.payment_status = 'overdue' THEN 'overdue'
    WHEN NEW.payment_status = 'pending' THEN 'unpaid'
    ELSE 'unpaid'
  END;

  IF NEW.membership_level IS NOT NULL THEN
    SELECT id INTO v_membership_type_id
    FROM membership_types
    WHERE club_id = NEW.club_id
      AND name = NEW.membership_level
      AND is_active = true
    LIMIT 1;
  END IF;

  INSERT INTO club_memberships (
    member_id,
    club_id,
    relationship_type,
    status,
    joined_date,
    expiry_date,
    payment_status,
    membership_type_id,
    pays_association_fees
  ) VALUES (
    NEW.user_id,
    NEW.club_id,
    'primary',
    v_new_status,
    NEW.date_joined,
    NEW.renewal_date,
    v_new_payment_status,
    v_membership_type_id,
    true
  )
  ON CONFLICT (member_id, club_id) DO UPDATE SET
    relationship_type = 'primary',
    status = EXCLUDED.status,
    joined_date = EXCLUDED.joined_date,
    expiry_date = EXCLUDED.expiry_date,
    payment_status = EXCLUDED.payment_status,
    membership_type_id = COALESCE(EXCLUDED.membership_type_id, club_memberships.membership_type_id),
    pays_association_fees = true,
    updated_at = now()
  WHERE club_memberships.status IS DISTINCT FROM EXCLUDED.status
    OR club_memberships.payment_status IS DISTINCT FROM EXCLUDED.payment_status
    OR club_memberships.joined_date IS DISTINCT FROM EXCLUDED.joined_date
    OR club_memberships.expiry_date IS DISTINCT FROM EXCLUDED.expiry_date
    OR club_memberships.relationship_type IS DISTINCT FROM 'primary';

  RETURN NEW;
END;
$$;
