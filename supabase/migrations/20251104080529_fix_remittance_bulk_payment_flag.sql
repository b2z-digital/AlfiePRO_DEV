/*
  # Add Bulk Payment Flag to Membership Remittances

  This migration adds a bulk_payment flag to track when remittances are paid in bulk,
  and updates the trigger to skip creating individual transactions for bulk payments.

  1. Changes
    - Adds bulk_payment boolean column (default false)
    - Updates trigger to skip when bulk_payment is true

  2. Security
    - No RLS changes needed
*/

-- Add bulk_payment flag
ALTER TABLE public.membership_remittances
ADD COLUMN IF NOT EXISTS bulk_payment boolean DEFAULT false;

-- Update the trigger to skip bulk payments
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
  -- Skip if this is a bulk payment (handled by frontend)
  IF NEW.bulk_payment = true THEN
    RETURN NEW;
  END IF;

  -- Only process when club_to_state_status changes to 'paid' from state side
  IF NEW.club_to_state_status = 'paid' AND (OLD.club_to_state_status IS NULL OR OLD.club_to_state_status = 'pending') THEN

    -- Get club and member info
    SELECT club_id, member_id, state_contribution_amount, national_contribution_amount
    INTO v_club_id, v_member_id, v_state_fee, v_national_fee
    FROM public.membership_remittances
    WHERE id = NEW.id;

    -- Get or create Association Fees category
    SELECT id INTO v_category_id
    FROM public.budget_categories
    WHERE club_id = v_club_id
    AND name = 'Association Fees'
    LIMIT 1;

    IF v_category_id IS NULL THEN
      INSERT INTO public.budget_categories (club_id, name, type, is_system, system_key)
      VALUES (v_club_id, 'Association Fees', 'expense', true, 'association_fees')
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
      payment_status,
      reference,
      linked_entity_type,
      linked_entity_id
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
      'bank',
      'paid',
      'REMIT-' || NEW.id,
      'remittance',
      NEW.id
    FROM public.members m
    WHERE m.id = v_member_id
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE reference = 'REMIT-' || NEW.id
    );

  END IF;

  RETURN NEW;
END;
$$;