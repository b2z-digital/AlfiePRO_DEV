/*
  # Enhanced Platform Billing System

  1. Modified Tables
    - `platform_billing_rates`
      - Added `target_entity_id` (uuid, nullable) - When set, rate applies to specific entity only
      - Added `annual_rate` (numeric) - Base annual rate per member for monthly calculation
      - Added `target_entity_name` (text) - Display name of targeted entity
    - `platform_billing_records`
      - Added `billing_period_id` (uuid, FK) - Links record to billing period
      - Added `annual_rate` (numeric) - Snapshot of annual rate at billing time
      - Added `due_date` (date) - Payment due date
      - New RLS policies for association/club admin read access

  2. New Tables
    - `platform_billing_periods` - Tracks each billing run
    - `platform_billing_member_snapshots` - Member count audit trail

  3. Security
    - RLS on all new tables
    - Super admins have full access
    - Entity admins can view their own billing data (read-only)

  4. Important Notes
    - Monthly billing: active_members x (annual_rate / 12)
    - Every active member counts fully regardless of join date
    - target_entity_id=NULL means rate applies to all entities of that type
    - Specific entity rates override generic rates
*/

-- ============================================================
-- 1. Enhance platform_billing_rates with granular targeting
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_rates' AND column_name = 'target_entity_id'
  ) THEN
    ALTER TABLE public.platform_billing_rates ADD COLUMN target_entity_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_rates' AND column_name = 'annual_rate'
  ) THEN
    ALTER TABLE public.platform_billing_rates ADD COLUMN annual_rate numeric(10,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_rates' AND column_name = 'target_entity_name'
  ) THEN
    ALTER TABLE public.platform_billing_rates ADD COLUMN target_entity_name text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_billing_rates_target_entity
  ON public.platform_billing_rates(billing_target, target_entity_id);

CREATE INDEX IF NOT EXISTS idx_platform_billing_rates_active_lookup
  ON public.platform_billing_rates(billing_target, is_active, effective_from);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_billing_rates' AND policyname = 'Entity admins can view applicable rates'
  ) THEN
    CREATE POLICY "Entity admins can view applicable rates"
      ON public.platform_billing_rates
      FOR SELECT TO authenticated
      USING (
        public.is_platform_super_admin()
        OR target_entity_id IS NULL
        OR (
          billing_target = 'state_association' AND EXISTS (
            SELECT 1 FROM public.user_state_associations usa
            WHERE usa.state_association_id = platform_billing_rates.target_entity_id
            AND usa.user_id = auth.uid()
            AND usa.role = 'state_admin'
          )
        )
        OR (
          billing_target = 'national_association' AND EXISTS (
            SELECT 1 FROM public.user_national_associations una
            WHERE una.national_association_id = platform_billing_rates.target_entity_id
            AND una.user_id = auth.uid()
            AND una.role = 'national_admin'
          )
        )
        OR (
          billing_target = 'club' AND EXISTS (
            SELECT 1 FROM public.user_clubs uc
            WHERE uc.club_id = platform_billing_rates.target_entity_id
            AND uc.user_id = auth.uid()
            AND uc.role = 'admin'
          )
        )
      );
  END IF;
END $$;


-- ============================================================
-- 2. Create platform_billing_periods table (no RLS referencing records yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_billing_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  billing_frequency text NOT NULL DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'quarterly', 'annually')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'generated', 'finalized', 'cancelled')),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz,
  finalized_at timestamptz,
  total_records integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_billing_periods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_billing_periods' AND policyname = 'Super admins can manage billing periods'
  ) THEN
    CREATE POLICY "Super admins can manage billing periods"
      ON public.platform_billing_periods
      FOR ALL TO authenticated
      USING (public.is_platform_super_admin())
      WITH CHECK (public.is_platform_super_admin());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_billing_periods_dates
  ON public.platform_billing_periods(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_platform_billing_periods_status
  ON public.platform_billing_periods(status);


-- ============================================================
-- 3. Enhance platform_billing_records with period linkage
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_records' AND column_name = 'billing_period_id'
  ) THEN
    ALTER TABLE public.platform_billing_records
      ADD COLUMN billing_period_id uuid REFERENCES public.platform_billing_periods(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_records' AND column_name = 'annual_rate'
  ) THEN
    ALTER TABLE public.platform_billing_records ADD COLUMN annual_rate numeric(10,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_records' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE public.platform_billing_records ADD COLUMN due_date date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_billing_records_period_id
  ON public.platform_billing_records(billing_period_id);
CREATE INDEX IF NOT EXISTS idx_platform_billing_records_due_date
  ON public.platform_billing_records(due_date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_billing_records' AND policyname = 'Entity admins can view their billing records'
  ) THEN
    CREATE POLICY "Entity admins can view their billing records"
      ON public.platform_billing_records
      FOR SELECT TO authenticated
      USING (
        (target_type = 'state_association' AND EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.state_association_id = target_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        ))
        OR (target_type = 'national_association' AND EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.national_association_id = target_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        ))
        OR (target_type = 'club' AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.club_id = target_id
          AND uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      );
  END IF;
END $$;


-- ============================================================
-- 4. NOW add billing_periods RLS that references billing_records
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_billing_periods' AND policyname = 'Entity admins can view their billing periods'
  ) THEN
    CREATE POLICY "Entity admins can view their billing periods"
      ON public.platform_billing_periods
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.platform_billing_records pbr
          WHERE pbr.billing_period_id = platform_billing_periods.id
          AND (
            (pbr.target_type = 'state_association' AND EXISTS (
              SELECT 1 FROM public.user_state_associations usa
              WHERE usa.state_association_id = pbr.target_id
              AND usa.user_id = auth.uid()
              AND usa.role = 'state_admin'
            ))
            OR
            (pbr.target_type = 'national_association' AND EXISTS (
              SELECT 1 FROM public.user_national_associations una
              WHERE una.national_association_id = pbr.target_id
              AND una.user_id = auth.uid()
              AND una.role = 'national_admin'
            ))
            OR
            (pbr.target_type = 'club' AND EXISTS (
              SELECT 1 FROM public.user_clubs uc
              WHERE uc.club_id = pbr.target_id
              AND uc.user_id = auth.uid()
              AND uc.role = 'admin'
            ))
          )
        )
      );
  END IF;
END $$;


-- ============================================================
-- 5. Create platform_billing_member_snapshots table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_billing_member_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id uuid NOT NULL REFERENCES public.platform_billing_periods(id) ON DELETE CASCADE,
  billing_record_id uuid REFERENCES public.platform_billing_records(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('club', 'state_association', 'national_association')),
  target_id uuid NOT NULL,
  target_name text NOT NULL DEFAULT '',
  total_active_members integer NOT NULL DEFAULT 0,
  new_members_this_period integer NOT NULL DEFAULT 0,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_billing_member_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_billing_member_snapshots' AND policyname = 'Super admins can manage member snapshots'
  ) THEN
    CREATE POLICY "Super admins can manage member snapshots"
      ON public.platform_billing_member_snapshots
      FOR ALL TO authenticated
      USING (public.is_platform_super_admin())
      WITH CHECK (public.is_platform_super_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'platform_billing_member_snapshots' AND policyname = 'Entity admins can view their snapshots'
  ) THEN
    CREATE POLICY "Entity admins can view their snapshots"
      ON public.platform_billing_member_snapshots
      FOR SELECT TO authenticated
      USING (
        (target_type = 'state_association' AND EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.state_association_id = target_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        ))
        OR (target_type = 'national_association' AND EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.national_association_id = target_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        ))
        OR (target_type = 'club' AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.club_id = target_id
          AND uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_member_snapshots_period
  ON public.platform_billing_member_snapshots(billing_period_id);
CREATE INDEX IF NOT EXISTS idx_billing_member_snapshots_target
  ON public.platform_billing_member_snapshots(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_billing_member_snapshots_record
  ON public.platform_billing_member_snapshots(billing_record_id);


-- ============================================================
-- 6. Backfill annual_rate for existing rates
-- ============================================================

UPDATE public.platform_billing_rates
SET annual_rate = CASE
  WHEN billing_frequency = 'annually' THEN rate_per_member
  WHEN billing_frequency = 'quarterly' THEN rate_per_member * 4
  WHEN billing_frequency = 'monthly' THEN rate_per_member * 12
  ELSE rate_per_member
END
WHERE annual_rate IS NULL;
