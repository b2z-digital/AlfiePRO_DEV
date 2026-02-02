/*
  # Remittance Automation Functions

  Creates helper functions and triggers to automatically:
  1. Create remittance records when memberships are paid
  2. Calculate fee splits based on current fee structure
  3. Update remittance status when payments are reconciled
  4. Generate reports and CSV exports

  ## Functions
  - get_active_fee_structure() - Get current fee structure for a state/national
  - create_membership_remittance() - Auto-create remittance on payment
  - reconcile_payment_to_remittances() - Auto-reconcile payments
  - get_outstanding_remittances() - Report outstanding liabilities
*/

-- Get active fee structure for a date
CREATE OR REPLACE FUNCTION public.get_active_fee_structure(
  p_state_association_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS public.membership_fee_structures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_fee_structure public.membership_fee_structures;
BEGIN
  SELECT * INTO v_fee_structure
  FROM public.membership_fee_structures
  WHERE state_association_id = p_state_association_id
    AND effective_from <= p_date
    AND (effective_to IS NULL OR effective_to >= p_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN v_fee_structure;
END;
$$;

-- Auto-create remittance when membership payment is created/updated
CREATE OR REPLACE FUNCTION public.create_membership_remittance_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_member_club_id uuid;
  v_state_association_id uuid;
  v_national_association_id uuid;
  v_fee_structure public.membership_fee_structures;
  v_membership_year integer;
  v_membership_start date;
  v_membership_end date;
  v_club_retained decimal(10,2);
BEGIN
  -- Only process if payment status is 'paid' or 'completed'
  IF NEW.status NOT IN ('paid', 'completed') THEN
    RETURN NEW;
  END IF;
  
  -- Get member's club
  SELECT club_id INTO v_member_club_id
  FROM public.members
  WHERE id = NEW.member_id;
  
  IF v_member_club_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get state association for this club
  SELECT state_association_id INTO v_state_association_id
  FROM public.state_association_clubs
  WHERE club_id = v_member_club_id
    AND is_active = true
  LIMIT 1;
  
  -- Get national association for the state
  IF v_state_association_id IS NOT NULL THEN
    SELECT national_association_id INTO v_national_association_id
    FROM public.state_associations
    WHERE id = v_state_association_id;
  END IF;
  
  -- Get active fee structure
  IF v_state_association_id IS NOT NULL THEN
    v_fee_structure := public.get_active_fee_structure(v_state_association_id, NEW.payment_date);
  END IF;
  
  -- Calculate membership year and dates
  v_membership_start := COALESCE(NEW.payment_date, CURRENT_DATE);
  v_membership_year := EXTRACT(YEAR FROM v_membership_start);
  v_membership_end := v_membership_start + INTERVAL '1 year';
  
  -- Calculate club retained amount
  v_club_retained := NEW.amount 
    - COALESCE(v_fee_structure.state_contribution_amount, 0) 
    - COALESCE(v_fee_structure.national_contribution_amount, 0);
  
  -- Check if remittance already exists for this payment
  IF NOT EXISTS (
    SELECT 1 FROM public.membership_remittances
    WHERE membership_payment_id = NEW.id
  ) THEN
    -- Create remittance record
    INSERT INTO public.membership_remittances (
      member_id,
      club_id,
      membership_payment_id,
      membership_type_id,
      state_association_id,
      national_association_id,
      fee_structure_id,
      total_membership_fee,
      state_contribution_amount,
      national_contribution_amount,
      club_retained_amount,
      club_to_state_status,
      state_to_national_status,
      membership_year,
      membership_start_date,
      membership_end_date
    ) VALUES (
      NEW.member_id,
      v_member_club_id,
      NEW.id,
      NEW.membership_type_id,
      v_state_association_id,
      v_national_association_id,
      v_fee_structure.id,
      NEW.amount,
      COALESCE(v_fee_structure.state_contribution_amount, 0),
      COALESCE(v_fee_structure.national_contribution_amount, 0),
      v_club_retained,
      'pending',
      'pending',
      v_membership_year,
      v_membership_start,
      v_membership_end
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-create remittances
DROP TRIGGER IF EXISTS trigger_create_remittance_on_payment ON public.membership_payments;
CREATE TRIGGER trigger_create_remittance_on_payment
  AFTER INSERT OR UPDATE ON public.membership_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_membership_remittance_on_payment();

-- Function to get outstanding remittances for a club
CREATE OR REPLACE FUNCTION public.get_outstanding_club_remittances(
  p_club_id uuid,
  p_status text DEFAULT 'pending'
)
RETURNS TABLE (
  remittance_id uuid,
  member_name text,
  member_email text,
  membership_year integer,
  total_fee decimal(10,2),
  state_contribution decimal(10,2),
  national_contribution decimal(10,2),
  status text,
  days_outstanding integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mr.id,
    CONCAT(m.first_name, ' ', m.last_name),
    m.email,
    mr.membership_year,
    mr.total_membership_fee,
    mr.state_contribution_amount,
    mr.national_contribution_amount,
    mr.club_to_state_status,
    CURRENT_DATE - mr.created_at::date
  FROM public.membership_remittances mr
  JOIN public.members m ON m.id = mr.member_id
  WHERE mr.club_id = p_club_id
    AND mr.club_to_state_status = p_status
  ORDER BY mr.created_at DESC;
END;
$$;

-- Function to calculate total outstanding for a club
CREATE OR REPLACE FUNCTION public.get_club_outstanding_total(
  p_club_id uuid
)
RETURNS TABLE (
  pending_count bigint,
  total_outstanding decimal(10,2),
  state_contribution_total decimal(10,2),
  national_contribution_total decimal(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint,
    SUM(mr.total_membership_fee),
    SUM(mr.state_contribution_amount),
    SUM(mr.national_contribution_amount)
  FROM public.membership_remittances mr
  WHERE mr.club_id = p_club_id
    AND mr.club_to_state_status = 'pending';
END;
$$;

-- Function to get state association outstanding (from clubs)
CREATE OR REPLACE FUNCTION public.get_state_outstanding_from_clubs(
  p_state_association_id uuid
)
RETURNS TABLE (
  club_id uuid,
  club_name text,
  pending_count bigint,
  total_outstanding decimal(10,2),
  oldest_unpaid_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mr.club_id,
    c.name,
    COUNT(*)::bigint,
    SUM(mr.state_contribution_amount),
    MIN(mr.membership_start_date)
  FROM public.membership_remittances mr
  JOIN public.clubs c ON c.id = mr.club_id
  WHERE mr.state_association_id = p_state_association_id
    AND mr.club_to_state_status = 'pending'
  GROUP BY mr.club_id, c.name
  ORDER BY MIN(mr.membership_start_date);
END;
$$;

-- Function to mark remittances as paid (bulk operation)
CREATE OR REPLACE FUNCTION public.mark_remittances_as_paid(
  p_remittance_ids uuid[],
  p_payment_id uuid,
  p_level text DEFAULT 'club_to_state'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_updated_count integer := 0;
  v_remittance_id uuid;
  v_payment_reference text;
  v_payment_date date;
BEGIN
  -- Get payment details
  SELECT payment_reference, payment_date
  INTO v_payment_reference, v_payment_date
  FROM public.association_payments
  WHERE id = p_payment_id;
  
  -- Update remittances based on level
  FOREACH v_remittance_id IN ARRAY p_remittance_ids
  LOOP
    IF p_level = 'club_to_state' THEN
      UPDATE public.membership_remittances
      SET 
        club_to_state_status = 'paid',
        club_to_state_paid_date = v_payment_date,
        club_to_state_payment_reference = v_payment_reference
      WHERE id = v_remittance_id;
      
    ELSIF p_level = 'state_to_national' THEN
      UPDATE public.membership_remittances
      SET 
        state_to_national_status = 'paid',
        state_to_national_paid_date = v_payment_date,
        state_to_national_payment_reference = v_payment_reference
      WHERE id = v_remittance_id;
    END IF;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  RETURN v_updated_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_active_fee_structure TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_outstanding_club_remittances TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_outstanding_total TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_state_outstanding_from_clubs TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_remittances_as_paid TO authenticated;
