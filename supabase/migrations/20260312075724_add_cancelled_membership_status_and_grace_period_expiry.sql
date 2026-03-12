/*
  # Cancelled Membership Status & Grace Period Expiry

  ## Summary
  Adds proper support for cancelled memberships and grace period expiry,
  ensuring member data is preserved rather than deleted when a membership is cancelled.

  ## Changes

  ### 1. members table columns
  - `cancelled_at` - timestamp when membership was cancelled
  - `cancelled_reason` - 'manual', 'non_renewal', or 'admin'
  - `previous_membership_level` - preserves the last membership type before cancellation

  ### 2. Function
  - `expire_members_past_grace_period()` - marks members as cancelled when
    their renewal_date + club grace_period has passed

  ### 3. RLS Policies
  - Club admins (admin/editor roles) can view cancelled members
  - State association admins can view cancelled members in their clubs
  - Members can see their own cancelled record (for renewal flow)

  ## Notes
  - Member data is NEVER deleted on cancellation - status changes to 'cancelled'
  - Cancelled members retain all historical data
  - The 'cancelled' status blocks platform access and triggers renewal flow
*/

-- Add cancelled tracking columns to members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE members ADD COLUMN cancelled_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'cancelled_reason'
  ) THEN
    ALTER TABLE members ADD COLUMN cancelled_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'previous_membership_level'
  ) THEN
    ALTER TABLE members ADD COLUMN previous_membership_level text;
  END IF;
END $$;

-- Add grace_period column to clubs if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'renewal_grace_period_days'
  ) THEN
    ALTER TABLE clubs ADD COLUMN renewal_grace_period_days integer DEFAULT 30;
  END IF;
END $$;

-- Function to expire members past their grace period
CREATE OR REPLACE FUNCTION expire_members_past_grace_period()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_updated integer := 0;
  v_club record;
BEGIN
  FOR v_club IN
    SELECT id, COALESCE(renewal_grace_period_days, 30) as grace_days
    FROM clubs
    WHERE id IS NOT NULL
  LOOP
    UPDATE members
    SET 
      membership_status = 'cancelled',
      is_financial = false,
      cancelled_at = now(),
      cancelled_reason = 'non_renewal',
      previous_membership_level = COALESCE(previous_membership_level, membership_level)
    WHERE 
      club_id = v_club.id
      AND membership_status IN ('active', 'expired')
      AND renewal_date IS NOT NULL
      AND renewal_date < (CURRENT_DATE - (v_club.grace_days || ' days')::interval)
      AND cancelled_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_count := v_count + v_updated;
  END LOOP;

  RETURN v_count;
END;
$$;

-- RLS: Club admins can view cancelled members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'members' AND policyname = 'Club admins can view cancelled members'
  ) THEN
    CREATE POLICY "Club admins can view cancelled members"
      ON members FOR SELECT
      TO authenticated
      USING (
        membership_status = 'cancelled'
        AND EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.club_id = members.club_id
          AND uc.role IN ('admin', 'editor')
        )
      );
  END IF;
END $$;

-- RLS: Association admins can view cancelled members in their clubs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'members' AND policyname = 'Association admins can view cancelled members'
  ) THEN
    CREATE POLICY "Association admins can view cancelled members"
      ON members FOR SELECT
      TO authenticated
      USING (
        membership_status = 'cancelled'
        AND EXISTS (
          SELECT 1 FROM clubs c
          JOIN user_state_associations usa ON usa.state_association_id = c.state_association_id
          WHERE c.id = members.club_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      );
  END IF;
END $$;

-- RLS: Members can see their own cancelled record (needed for renewal flow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'members' AND policyname = 'Members can view their own cancelled record'
  ) THEN
    CREATE POLICY "Members can view their own cancelled record"
      ON members FOR SELECT
      TO authenticated
      USING (
        membership_status = 'cancelled'
        AND user_id = auth.uid()
      );
  END IF;
END $$;

-- RLS: Club admins can update cancelled members (for reactivation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'members' AND policyname = 'Club admins can update cancelled members'
  ) THEN
    CREATE POLICY "Club admins can update cancelled members"
      ON members FOR UPDATE
      TO authenticated
      USING (
        membership_status = 'cancelled'
        AND EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.club_id = members.club_id
          AND uc.role IN ('admin', 'editor')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.club_id = members.club_id
          AND uc.role IN ('admin', 'editor')
        )
      );
  END IF;
END $$;
