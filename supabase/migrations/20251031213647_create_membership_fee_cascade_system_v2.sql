/*
  # Multi-Level Membership Fee Cascade System

  Creates a comprehensive system for tracking membership fees from clubs through
  state associations to national associations.

  ## New Tables

  1. `membership_fee_structures` - Fee split configuration
  2. `membership_remittances` - Individual member fee tracking
  3. `association_payments` - Bulk/individual payments between entities
  4. `remittance_reconciliations` - Payment allocation to members

  ## Security
     - RLS policies for club/state/national admin access
     - Proper foreign key constraints
     - Audit fields for tracking changes
*/

-- Fee Structure Configuration Table
CREATE TABLE IF NOT EXISTS public.membership_fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Association details
  state_association_id uuid REFERENCES public.state_associations(id) ON DELETE CASCADE,
  national_association_id uuid REFERENCES public.national_associations(id) ON DELETE CASCADE,
  
  -- Fee configuration
  state_contribution_amount decimal(10,2) NOT NULL DEFAULT 15.00,
  national_contribution_amount decimal(10,2) NOT NULL DEFAULT 5.00,
  
  -- Effective date range
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  
  -- Metadata
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT valid_date_range CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT positive_amounts CHECK (
    state_contribution_amount >= 0 AND 
    national_contribution_amount >= 0
  )
);

-- Individual Member Remittance Tracking
CREATE TABLE IF NOT EXISTS public.membership_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Member and membership details
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  membership_payment_id uuid REFERENCES public.membership_payments(id) ON DELETE SET NULL,
  membership_type_id uuid REFERENCES public.membership_types(id) ON DELETE SET NULL,
  
  -- Association hierarchy
  state_association_id uuid REFERENCES public.state_associations(id) ON DELETE SET NULL,
  national_association_id uuid REFERENCES public.national_associations(id) ON DELETE SET NULL,
  
  -- Fee structure used (historical reference)
  fee_structure_id uuid REFERENCES public.membership_fee_structures(id) ON DELETE SET NULL,
  
  -- Financial details
  total_membership_fee decimal(10,2) NOT NULL,
  state_contribution_amount decimal(10,2) NOT NULL DEFAULT 0,
  national_contribution_amount decimal(10,2) NOT NULL DEFAULT 0,
  club_retained_amount decimal(10,2) NOT NULL DEFAULT 0,
  
  -- Payment status tracking
  club_to_state_status text NOT NULL DEFAULT 'pending' CHECK (
    club_to_state_status IN ('pending', 'partially_paid', 'paid', 'overdue', 'waived')
  ),
  club_to_state_paid_date date,
  club_to_state_payment_reference text,
  
  state_to_national_status text NOT NULL DEFAULT 'pending' CHECK (
    state_to_national_status IN ('pending', 'partially_paid', 'paid', 'overdue', 'waived')
  ),
  state_to_national_paid_date date,
  state_to_national_payment_reference text,
  
  -- Period information
  membership_year integer NOT NULL,
  membership_start_date date NOT NULL,
  membership_end_date date,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT valid_membership_year CHECK (membership_year >= 2020 AND membership_year <= 2100)
);

-- Payment Records (Bulk or Individual)
CREATE TABLE IF NOT EXISTS public.association_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Payment direction
  from_entity_type text NOT NULL CHECK (from_entity_type IN ('club', 'state_association')),
  from_entity_id uuid NOT NULL,
  to_entity_type text NOT NULL CHECK (to_entity_type IN ('state_association', 'national_association')),
  to_entity_id uuid NOT NULL,
  
  -- Payment details
  payment_type text NOT NULL DEFAULT 'bulk' CHECK (payment_type IN ('bulk', 'individual')),
  payment_method text CHECK (payment_method IN ('eft', 'credit_card', 'cheque', 'cash', 'other')),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Financial
  amount decimal(10,2) NOT NULL,
  currency text DEFAULT 'AUD',
  
  -- References
  payment_reference text,
  external_reference text,
  
  -- Reconciliation
  reconciliation_status text NOT NULL DEFAULT 'unreconciled' CHECK (
    reconciliation_status IN ('unreconciled', 'partially_reconciled', 'reconciled', 'disputed')
  ),
  reconciled_amount decimal(10,2) DEFAULT 0,
  reconciled_at timestamptz,
  reconciled_by uuid REFERENCES auth.users(id),
  
  -- Period covered
  period_start_date date,
  period_end_date date,
  membership_year integer,
  
  -- Finance integration
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  
  -- Metadata
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT positive_amount CHECK (amount > 0),
  CONSTRAINT valid_reconciled_amount CHECK (reconciled_amount >= 0 AND reconciled_amount <= amount)
);

-- Reconciliation Links
CREATE TABLE IF NOT EXISTS public.remittance_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links
  association_payment_id uuid NOT NULL REFERENCES public.association_payments(id) ON DELETE CASCADE,
  membership_remittance_id uuid NOT NULL REFERENCES public.membership_remittances(id) ON DELETE CASCADE,
  
  -- Allocation
  allocated_amount decimal(10,2) NOT NULL,
  allocation_level text NOT NULL CHECK (allocation_level IN ('club_to_state', 'state_to_national')),
  
  -- Reconciliation details
  reconciled_by uuid REFERENCES auth.users(id),
  reconciled_at timestamptz DEFAULT now(),
  notes text,
  
  CONSTRAINT positive_allocation CHECK (allocated_amount > 0)
);

-- Indexes
CREATE INDEX idx_membership_fee_structures_state ON public.membership_fee_structures(state_association_id);
CREATE INDEX idx_membership_fee_structures_national ON public.membership_fee_structures(national_association_id);
CREATE INDEX idx_membership_fee_structures_effective ON public.membership_fee_structures(effective_from, effective_to);

CREATE INDEX idx_membership_remittances_member ON public.membership_remittances(member_id);
CREATE INDEX idx_membership_remittances_club ON public.membership_remittances(club_id);
CREATE INDEX idx_membership_remittances_state ON public.membership_remittances(state_association_id);
CREATE INDEX idx_membership_remittances_national ON public.membership_remittances(national_association_id);
CREATE INDEX idx_membership_remittances_year ON public.membership_remittances(membership_year);
CREATE INDEX idx_membership_remittances_club_state_status ON public.membership_remittances(club_id, club_to_state_status);

CREATE INDEX idx_association_payments_from ON public.association_payments(from_entity_type, from_entity_id);
CREATE INDEX idx_association_payments_to ON public.association_payments(to_entity_type, to_entity_id);
CREATE INDEX idx_association_payments_date ON public.association_payments(payment_date);
CREATE INDEX idx_association_payments_status ON public.association_payments(reconciliation_status);

CREATE INDEX idx_remittance_reconciliations_payment ON public.remittance_reconciliations(association_payment_id);
CREATE INDEX idx_remittance_reconciliations_remittance ON public.remittance_reconciliations(membership_remittance_id);

-- Enable RLS
ALTER TABLE public.membership_fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.association_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_reconciliations ENABLE ROW LEVEL SECURITY;

-- RLS: Fee Structures
CREATE POLICY "State admins manage fee structures"
  ON public.membership_fee_structures FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = membership_fee_structures.state_association_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'admin'
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Clubs view fee structures"
  ON public.membership_fee_structures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      JOIN public.state_association_clubs sac ON sac.club_id = uc.club_id
      WHERE sac.state_association_id = membership_fee_structures.state_association_id
        AND uc.user_id = auth.uid()
    )
  );

-- RLS: Remittances
CREATE POLICY "Club admins view club remittances"
  ON public.membership_remittances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = membership_remittances.club_id
        AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins manage club remittances"
  ON public.membership_remittances FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = membership_remittances.club_id
        AND uc.user_id = auth.uid()
        AND uc.role = 'admin'
    )
  );

CREATE POLICY "State admins view state remittances"
  ON public.membership_remittances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = membership_remittances.state_association_id
        AND usa.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "State admins update remittance status"
  ON public.membership_remittances FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = membership_remittances.state_association_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'admin'
    )
  );

-- RLS: Payments
CREATE POLICY "Users view relevant payments"
  ON public.association_payments FOR SELECT
  TO authenticated
  USING (
    (from_entity_type = 'club' AND EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = association_payments.from_entity_id
        AND uc.user_id = auth.uid()
    ))
    OR
    ((from_entity_type = 'state_association' OR to_entity_type = 'state_association') AND EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE (usa.state_association_id = association_payments.from_entity_id OR usa.state_association_id = association_payments.to_entity_id)
        AND usa.user_id = auth.uid()
    ))
    OR
    (to_entity_type = 'national_association' AND EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.national_association_id = association_payments.to_entity_id
        AND una.user_id = auth.uid()
    ))
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Authorized users create payments"
  ON public.association_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    (from_entity_type = 'club' AND EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = association_payments.from_entity_id
        AND uc.user_id = auth.uid()
        AND uc.role = 'admin'
    ))
    OR
    (from_entity_type = 'state_association' AND EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = association_payments.from_entity_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'admin'
    ))
  );

CREATE POLICY "Recipients update payments"
  ON public.association_payments FOR UPDATE
  TO authenticated
  USING (
    (to_entity_type = 'state_association' AND EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.state_association_id = association_payments.to_entity_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'admin'
    ))
    OR
    (to_entity_type = 'national_association' AND EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.national_association_id = association_payments.to_entity_id
        AND una.user_id = auth.uid()
        AND una.role = 'admin'
    ))
    OR created_by = auth.uid()
  );

-- RLS: Reconciliations
CREATE POLICY "Users view reconciliations"
  ON public.remittance_reconciliations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.association_payments ap
      WHERE ap.id = remittance_reconciliations.association_payment_id
    )
  );

CREATE POLICY "Recipients create reconciliations"
  ON public.remittance_reconciliations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.association_payments ap
      WHERE ap.id = remittance_reconciliations.association_payment_id
        AND (
          (ap.to_entity_type = 'state_association' AND EXISTS (
            SELECT 1 FROM public.user_state_associations usa
            WHERE usa.state_association_id = ap.to_entity_id
              AND usa.user_id = auth.uid()
              AND usa.role = 'admin'
          ))
          OR
          (ap.to_entity_type = 'national_association' AND EXISTS (
            SELECT 1 FROM public.user_national_associations una
            WHERE una.national_association_id = ap.to_entity_id
              AND una.user_id = auth.uid()
              AND una.role = 'admin'
          ))
        )
    )
  );

-- Triggers
CREATE TRIGGER update_membership_fee_structures_updated_at
  BEFORE UPDATE ON public.membership_fee_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_membership_remittances_updated_at
  BEFORE UPDATE ON public.membership_remittances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_association_payments_updated_at
  BEFORE UPDATE ON public.association_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
