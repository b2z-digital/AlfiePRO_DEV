/*
  # Fix sync_member_to_club_membership to preserve financial status

  1. Problem
    - When a member accepts an invitation (user_id gets set on member record),
      the sync_member_to_club_membership trigger creates a club_memberships row
    - The trigger only checked `payment_status` column to determine financial state,
      but many members have `payment_status = NULL` while `is_financial = true`
    - This caused the club_memberships record to be created with `payment_status = 'unpaid'`
    - The reverse sync trigger then overwrote the member's `is_financial` to `false`
      and `payment_status` to `pending`, losing the admin's manual financial settings

  2. Fix
    - Updated payment status mapping to also check `is_financial` flag
    - If `is_financial = true`, map to 'paid' regardless of payment_status column
    - Updated membership_type lookup to use `membership_level` text match
    - Preserves existing membership data when creating club_memberships records

  3. Impact
    - Members who accept invitations will no longer lose their financial status
    - Existing members' financial data is preserved during the sync process
*/

CREATE OR REPLACE FUNCTION sync_member_to_club_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_exists boolean;
  v_new_status text;
  v_new_payment_status text;
  v_current_status text;
  v_current_payment_status text;
  v_current_joined_date date;
  v_current_expiry_date date;
  v_membership_type_id uuid;
BEGIN
  IF NEW.membership_status != 'archived' THEN

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

    SELECT EXISTS (
      SELECT 1 FROM club_memberships
      WHERE member_id = NEW.user_id
        AND club_id = NEW.club_id
        AND relationship_type = 'primary'
    ) INTO v_membership_exists;

    IF v_membership_exists THEN
      SELECT status, payment_status, joined_date, expiry_date
      INTO v_current_status, v_current_payment_status, v_current_joined_date, v_current_expiry_date
      FROM club_memberships
      WHERE member_id = NEW.user_id
        AND club_id = NEW.club_id
        AND relationship_type = 'primary';

      IF v_current_status IS DISTINCT FROM v_new_status
        OR v_current_payment_status IS DISTINCT FROM v_new_payment_status
        OR v_current_joined_date IS DISTINCT FROM NEW.date_joined
        OR v_current_expiry_date IS DISTINCT FROM NEW.renewal_date THEN

        UPDATE club_memberships
        SET
          status = v_new_status,
          joined_date = NEW.date_joined,
          expiry_date = NEW.renewal_date,
          payment_status = v_new_payment_status,
          membership_type_id = COALESCE(v_membership_type_id, membership_type_id),
          updated_at = now()
        WHERE member_id = NEW.user_id
          AND club_id = NEW.club_id;
      END IF;
    ELSE
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
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
