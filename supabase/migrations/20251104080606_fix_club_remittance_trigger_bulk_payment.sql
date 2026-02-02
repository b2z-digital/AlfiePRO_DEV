/*
  # Fix Club Remittance Trigger to Skip Bulk Payments

  This migration updates the create_club_remittance_transaction function
  to skip creating individual transactions when bulk_payment is true.

  1. Changes
    - Adds check to skip bulk payments at the start of the function

  2. Security
    - Maintains SECURITY DEFINER with proper security
*/

CREATE OR REPLACE FUNCTION public.create_club_remittance_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_category_id uuid;
v_member_name text;
v_state_name text;
BEGIN
-- Skip if this is a bulk payment (handled by frontend)
IF NEW.bulk_payment = true THEN
RETURN NEW;
END IF;

-- Only proceed when club marks as paid to state
IF NEW.club_to_state_status = 'paid' AND (
TG_OP = 'INSERT' OR 
(TG_OP = 'UPDATE' AND OLD.club_to_state_status != 'paid')
) THEN
-- Get state association name
SELECT name INTO v_state_name
FROM state_associations
WHERE id = NEW.state_association_id;

-- Get member name
SELECT first_name || ' ' || last_name INTO v_member_name
FROM members
WHERE id = NEW.member_id;

-- Get or create "Membership Remittances" expense category for club
SELECT id INTO v_category_id
FROM budget_categories
WHERE club_id = NEW.club_id
AND system_key = 'membership_remittances'
AND is_system = true;

-- If category doesn't exist, create it
IF v_category_id IS NULL THEN
INSERT INTO budget_categories (
club_id,
name,
type,
description,
is_system,
system_key,
is_active
) VALUES (
NEW.club_id,
'Membership Remittances',
'expense',
'Membership fee remittances to state and national associations',
true,
'membership_remittances',
true
)
RETURNING id INTO v_category_id;
END IF;

-- Create club expense transaction (uses 'paid' for transactions table)
INSERT INTO transactions (
club_id,
type,
category_id,
description,
amount,
date,
payment_method,
reference,
notes,
payee,
linked_entity_type,
linked_entity_id,
payment_status
) VALUES (
NEW.club_id,
'expense',
v_category_id,
'Membership Remittance to State Association - ' || COALESCE(v_member_name, 'Member'),
NEW.state_contribution_amount,
COALESCE(NEW.club_to_state_paid_date, CURRENT_DATE),
'bank',
NEW.club_to_state_payment_reference,
'Remittance ID: ' || NEW.id || ' | State: ' || COALESCE(v_state_name, 'N/A'),
v_state_name,
'remittance',
NEW.id,
'paid'
);

-- Create state association income transaction (uses 'completed' for association_transactions table)
INSERT INTO association_transactions (
association_id,
association_type,
type,
category_id,
description,
amount,
date,
payment_method,
reference,
notes,
payer,
linked_entity_type,
linked_entity_id,
payment_status
)
SELECT
NEW.state_association_id,
'state',
'income',
abc.id,
'Membership Remittance from ' || c.name || ' - ' || COALESCE(v_member_name, 'Member'),
NEW.state_contribution_amount,
COALESCE(NEW.club_to_state_paid_date, CURRENT_DATE),
'bank',
NEW.club_to_state_payment_reference,
'Remittance ID: ' || NEW.id,
c.name,
'remittance',
NEW.id,
'completed'
FROM clubs c
LEFT JOIN association_budget_categories abc ON 
abc.association_id = NEW.state_association_id 
AND abc.association_type = 'state'
AND abc.system_key = 'club_remittances'
WHERE c.id = NEW.club_id;
END IF;

RETURN NEW;
END;
$function$;