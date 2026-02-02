/*
  # Fix Remittance Sync Function Table Names

  This migration fixes the sync_remittance_status_to_club function to use the correct
  table names: 'transactions' instead of 'finance_transactions' and 'budget_categories'
  instead of 'finance_categories'.

  1. Changes
    - Updates function to use correct table names
    - Removes references to non-existent tables
    - Ensures proper finance integration

  2. Security
    - Maintains SECURITY DEFINER with proper search_path
*/

-- Fix the sync function with correct table names
CREATE OR REPLACE FUNCTION public.sync_remittance_status_to_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_club_id uuid;
  v_member_id uuid;
  v_state_fee numeric;
  v_national_fee numeric;
  v_category_id uuid;
BEGIN
  -- Only process when club_to_state_status changes to 'paid' from state side
  IF NEW.club_to_state_status = 'paid' AND (OLD.club_to_state_status IS NULL OR OLD.club_to_state_status = 'pending') THEN

    -- Get club and member info
    SELECT club_id, member_id, state_contribution_amount, national_contribution_amount
    INTO v_club_id, v_member_id, v_state_fee, v_national_fee
    FROM public.membership_remittances
    WHERE id = NEW.id;

    -- Check if club has finance integration enabled
    IF EXISTS (
      SELECT 1 FROM public.clubs
      WHERE id = v_club_id
      AND finance_integration_enabled = true
    ) THEN

      -- Get or create Association Fees category
      SELECT id INTO v_category_id
      FROM public.budget_categories
      WHERE club_id = v_club_id
      AND name = 'Association Fees'
      LIMIT 1;

      IF v_category_id IS NULL THEN
        INSERT INTO public.budget_categories (club_id, name, type, color)
        VALUES (v_club_id, 'Association Fees', 'expense', '#EF4444')
        RETURNING id INTO v_category_id;
      END IF;

      -- Create expense in club finances (state fee only, as it includes national portion)
      INSERT INTO public.transactions (
        club_id,
        type,
        category_id,
        description,
        amount,
        date,
        payment_method,
        reference,
        is_remittance_payment
      )
      SELECT
        v_club_id,
        'expense',
        v_category_id,
        'State Association Fee - ' || m.first_name || ' ' || m.last_name ||
        CASE WHEN v_national_fee > 0
          THEN ' (includes $' || v_national_fee::text || ' for National)'
          ELSE ''
        END,
        v_state_fee,
        NEW.club_to_state_paid_date,
        'bank_transfer',
        'REMIT-' || NEW.id,
        true
      FROM public.members m
      WHERE m.id = v_member_id
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions
        WHERE reference = 'REMIT-' || NEW.id
      );

    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS sync_remittance_status_to_club_trigger ON public.membership_remittances;
CREATE TRIGGER sync_remittance_status_to_club_trigger
  AFTER UPDATE ON public.membership_remittances
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_remittance_status_to_club();