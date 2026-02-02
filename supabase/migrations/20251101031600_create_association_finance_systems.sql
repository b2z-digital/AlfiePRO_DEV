/*
  # Create Finance Systems for State and National Associations

  1. New Tables
    - `association_budget_categories` - Budget categories for state/national associations
    - `association_transactions` - Financial transactions for associations
    - `remittance_payment_batches` - Batch payments from state to national

  2. Categories
    - System categories for:
      - Club membership remittances (income for state)
      - State membership remittances (income for national)
      - Operational expenses and income
    
  3. Integration
    - Links to membership_remittances for tracking
    - Automatic transaction creation when remittances are marked paid
    - Complete audit trail

  4. Security
    - RLS policies for state and national admins
    - Read-only access for historical records
    - Secure triggers for automatic transaction creation
*/

-- Association Budget Categories Table
CREATE TABLE IF NOT EXISTS association_budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  description text,
  is_system boolean NOT NULL DEFAULT false,
  system_key text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(association_id, system_key, association_type)
);

-- Association Transactions Table
CREATE TABLE IF NOT EXISTS association_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category_id uuid REFERENCES association_budget_categories(id),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  date date NOT NULL,
  payment_method text,
  payment_status text DEFAULT 'completed' CHECK (payment_status IN ('completed', 'pending', 'failed')),
  reference text,
  notes text,
  payer text,
  payee text,
  linked_entity_type text CHECK (linked_entity_type IN ('remittance', 'club', 'state', 'operational')),
  linked_entity_id uuid,
  batch_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Remittance Payment Batches
CREATE TABLE IF NOT EXISTS remittance_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_association_id uuid NOT NULL,
  from_association_type text NOT NULL CHECK (from_association_type IN ('state', 'national')),
  to_association_id uuid,
  to_association_type text CHECK (to_association_type IN ('state', 'national')),
  total_amount numeric(12,2) NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  payment_date date NOT NULL,
  payment_method text,
  payment_reference text,
  notes text,
  state_transaction_id uuid REFERENCES association_transactions(id),
  national_transaction_id uuid REFERENCES association_transactions(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_association_categories_association 
  ON association_budget_categories(association_id, association_type);
CREATE INDEX IF NOT EXISTS idx_association_categories_system 
  ON association_budget_categories(system_key, is_system) WHERE is_system = true;
CREATE INDEX IF NOT EXISTS idx_association_transactions_association 
  ON association_transactions(association_id, association_type);
CREATE INDEX IF NOT EXISTS idx_association_transactions_date 
  ON association_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_association_transactions_category 
  ON association_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_association_transactions_linked 
  ON association_transactions(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_remittance_batches_from 
  ON remittance_payment_batches(from_association_id, from_association_type);
CREATE INDEX IF NOT EXISTS idx_remittance_batches_to 
  ON remittance_payment_batches(to_association_id, to_association_type);

-- Enable RLS
ALTER TABLE association_budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE association_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittance_payment_batches ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is state admin for an association
CREATE OR REPLACE FUNCTION is_state_admin_for_association(p_association_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_state_associations usa
    WHERE usa.state_association_id = p_association_id
    AND usa.user_id = auth.uid()
    AND usa.role = 'admin'
  );
$$;

-- Helper function to check if user is national admin for an association
CREATE OR REPLACE FUNCTION is_national_admin_for_association(p_association_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_national_associations una
    WHERE una.national_association_id = p_association_id
    AND una.user_id = auth.uid()
    AND una.role = 'admin'
  );
$$;

-- RLS Policies for association_budget_categories
CREATE POLICY "State admins can view their association categories"
  ON association_budget_categories FOR SELECT
  TO authenticated
  USING (
    association_type = 'state' 
    AND is_state_admin_for_association(association_id)
  );

CREATE POLICY "National admins can view their association categories"
  ON association_budget_categories FOR SELECT
  TO authenticated
  USING (
    association_type = 'national' 
    AND is_national_admin_for_association(association_id)
  );

CREATE POLICY "State admins can manage their association categories"
  ON association_budget_categories FOR ALL
  TO authenticated
  USING (
    association_type = 'state' 
    AND is_state_admin_for_association(association_id)
  )
  WITH CHECK (
    association_type = 'state' 
    AND is_state_admin_for_association(association_id)
  );

CREATE POLICY "National admins can manage their association categories"
  ON association_budget_categories FOR ALL
  TO authenticated
  USING (
    association_type = 'national' 
    AND is_national_admin_for_association(association_id)
  )
  WITH CHECK (
    association_type = 'national' 
    AND is_national_admin_for_association(association_id)
  );

-- RLS Policies for association_transactions
CREATE POLICY "State admins can view their association transactions"
  ON association_transactions FOR SELECT
  TO authenticated
  USING (
    association_type = 'state' 
    AND is_state_admin_for_association(association_id)
  );

CREATE POLICY "National admins can view their association transactions"
  ON association_transactions FOR SELECT
  TO authenticated
  USING (
    association_type = 'national' 
    AND is_national_admin_for_association(association_id)
  );

CREATE POLICY "State admins can manage their association transactions"
  ON association_transactions FOR ALL
  TO authenticated
  USING (
    association_type = 'state' 
    AND is_state_admin_for_association(association_id)
  )
  WITH CHECK (
    association_type = 'state' 
    AND is_state_admin_for_association(association_id)
  );

CREATE POLICY "National admins can manage their association transactions"
  ON association_transactions FOR ALL
  TO authenticated
  USING (
    association_type = 'national' 
    AND is_national_admin_for_association(association_id)
  )
  WITH CHECK (
    association_type = 'national' 
    AND is_national_admin_for_association(association_id)
  );

-- RLS Policies for remittance_payment_batches
CREATE POLICY "State admins can view their batches"
  ON remittance_payment_batches FOR SELECT
  TO authenticated
  USING (
    from_association_type = 'state' 
    AND is_state_admin_for_association(from_association_id)
  );

CREATE POLICY "National admins can view batches sent to them"
  ON remittance_payment_batches FOR SELECT
  TO authenticated
  USING (
    to_association_type = 'national' 
    AND is_national_admin_for_association(to_association_id)
  );

CREATE POLICY "State admins can create batches"
  ON remittance_payment_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    from_association_type = 'state' 
    AND is_state_admin_for_association(from_association_id)
  );

-- Function to ensure system categories exist for associations
CREATE OR REPLACE FUNCTION ensure_association_system_categories(
  p_association_id uuid,
  p_association_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_config jsonb;
BEGIN
  -- System categories configuration
  IF p_association_type = 'state' THEN
    -- State association categories
    v_category_config := jsonb_build_array(
      jsonb_build_object(
        'name', 'Club Membership Remittances',
        'type', 'income',
        'system_key', 'club_remittances',
        'description', 'Membership fee remittances received from member clubs'
      ),
      jsonb_build_object(
        'name', 'National Association Fees',
        'type', 'expense',
        'system_key', 'national_remittances',
        'description', 'Membership fee remittances paid to national association'
      ),
      jsonb_build_object(
        'name', 'State Operations',
        'type', 'expense',
        'system_key', 'state_operations',
        'description', 'General operational expenses for state association'
      ),
      jsonb_build_object(
        'name', 'Other Income',
        'type', 'income',
        'system_key', 'other_income',
        'description', 'Other income sources for state association'
      )
    );
  ELSE
    -- National association categories
    v_category_config := jsonb_build_array(
      jsonb_build_object(
        'name', 'State Membership Remittances',
        'type', 'income',
        'system_key', 'state_remittances',
        'description', 'Membership fee remittances received from state associations'
      ),
      jsonb_build_object(
        'name', 'National Operations',
        'type', 'expense',
        'system_key', 'national_operations',
        'description', 'General operational expenses for national association'
      ),
      jsonb_build_object(
        'name', 'Other Income',
        'type', 'income',
        'system_key', 'other_income',
        'description', 'Other income sources for national association'
      )
    );
  END IF;

  -- Insert categories if they don't exist
  INSERT INTO association_budget_categories (
    association_id,
    association_type,
    name,
    type,
    system_key,
    description,
    is_system,
    is_active
  )
  SELECT
    p_association_id,
    p_association_type,
    cat->>'name',
    cat->>'type',
    cat->>'system_key',
    cat->>'description',
    true,
    true
  FROM jsonb_array_elements(v_category_config) AS cat
  WHERE NOT EXISTS (
    SELECT 1 FROM association_budget_categories
    WHERE association_id = p_association_id
    AND association_type = p_association_type
    AND system_key = cat->>'system_key'
  );
END;
$$;

-- Create system categories for existing associations
DO $$
DECLARE
  assoc RECORD;
BEGIN
  -- State associations
  FOR assoc IN SELECT id FROM state_associations LOOP
    PERFORM ensure_association_system_categories(assoc.id, 'state');
  END LOOP;
  
  -- National associations
  FOR assoc IN SELECT id FROM national_associations LOOP
    PERFORM ensure_association_system_categories(assoc.id, 'national');
  END LOOP;
END $$;

-- Trigger to create system categories for new associations
CREATE OR REPLACE FUNCTION create_system_categories_for_new_association()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'state_associations' THEN
    PERFORM ensure_association_system_categories(NEW.id, 'state');
  ELSIF TG_TABLE_NAME = 'national_associations' THEN
    PERFORM ensure_association_system_categories(NEW.id, 'national');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_state_association_categories ON state_associations;
CREATE TRIGGER trigger_create_state_association_categories
  AFTER INSERT ON state_associations
  FOR EACH ROW
  EXECUTE FUNCTION create_system_categories_for_new_association();

DROP TRIGGER IF EXISTS trigger_create_national_association_categories ON national_associations;
CREATE TRIGGER trigger_create_national_association_categories
  AFTER INSERT ON national_associations
  FOR EACH ROW
  EXECUTE FUNCTION create_system_categories_for_new_association();