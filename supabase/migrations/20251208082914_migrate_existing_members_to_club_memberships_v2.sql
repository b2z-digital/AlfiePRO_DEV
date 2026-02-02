/*
  # Migrate Existing Members to Multi-Club System

  1. Migration Strategy
    - Create club_memberships records for all existing members
    - Set relationship_type to 'primary' (they pay association fees)
    - Preserve all existing member data and relationships
    - Assign global member numbers to existing profiles
    - Set primary_club_id on profiles

  2. Backward Compatibility
    - Members table remains intact
    - All existing queries still work
    - New multi-club features layer on top

  3. Safe Rollout
    - Only creates records if they don't exist
    - Idempotent - can be run multiple times safely
*/

-- Function to migrate existing members to club_memberships
CREATE OR REPLACE FUNCTION migrate_existing_members_to_club_memberships()
RETURNS TABLE (
  migrated_count integer,
  skipped_count integer,
  error_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_migrated integer := 0;
  v_skipped integer := 0;
  v_error integer := 0;
  v_member record;
  v_member_number text;
BEGIN
  -- Loop through all existing members
  FOR v_member IN 
    SELECT 
      m.id as member_id,
      m.club_id,
      m.user_id,
      m.membership_level,
      m.membership_status,
      m.date_joined,
      m.renewal_date,
      m.payment_status,
      m.is_financial
    FROM members m
    WHERE m.user_id IS NOT NULL -- Only migrate members with user accounts
    AND (m.membership_status IS NULL OR m.membership_status != 'archived') -- Don't migrate archived
  LOOP
    BEGIN
      -- Check if this member already has a club_membership record
      IF NOT EXISTS (
        SELECT 1 FROM club_memberships
        WHERE member_id = v_member.user_id
        AND club_id = v_member.club_id
      ) THEN
        -- Create the club_membership record
        INSERT INTO club_memberships (
          member_id,
          club_id,
          membership_type_id,
          relationship_type,
          status,
          joined_date,
          expiry_date,
          payment_status,
          pays_association_fees,
          created_at
        ) VALUES (
          v_member.user_id,
          v_member.club_id,
          NULL, -- We'll map membership types later
          'primary', -- Existing members are primary members
          CASE 
            WHEN v_member.membership_status = 'active' THEN 'active'
            WHEN v_member.membership_status = 'expired' THEN 'expired'
            WHEN v_member.membership_status = 'pending' THEN 'pending'
            WHEN v_member.membership_status = 'archived' THEN 'archived'
            ELSE 'active'
          END,
          v_member.date_joined,
          v_member.renewal_date,
          CASE 
            WHEN v_member.is_financial = true THEN 'paid'
            WHEN v_member.payment_status = 'paid' THEN 'paid'
            WHEN v_member.payment_status = 'partial' THEN 'partial'
            WHEN v_member.payment_status = 'overdue' THEN 'overdue'
            ELSE 'unpaid'
          END,
          true, -- Primary members pay association fees
          now()
        );
        
        -- Assign member number if profile doesn't have one
        IF EXISTS (SELECT 1 FROM profiles WHERE id = v_member.user_id) THEN
          UPDATE profiles
          SET 
            member_number = COALESCE(member_number, generate_member_number('AUS', NULL)),
            primary_club_id = COALESCE(primary_club_id, v_member.club_id),
            registration_source = COALESCE(registration_source, 'direct')
          WHERE id = v_member.user_id
          AND (member_number IS NULL OR primary_club_id IS NULL);
        END IF;
        
        v_migrated := v_migrated + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with next member
      v_error := v_error + 1;
      RAISE WARNING 'Error migrating member %: %', v_member.member_id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_migrated, v_skipped, v_error;
END;
$$;

-- Run the migration
DO $$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO v_result FROM migrate_existing_members_to_club_memberships();
  RAISE NOTICE 'Migration complete: % migrated, % skipped, % errors', 
    v_result.migrated_count, 
    v_result.skipped_count, 
    v_result.error_count;
END $$;

-- Function to sync member updates to club_memberships (bidirectional sync)
CREATE OR REPLACE FUNCTION sync_member_to_club_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a member record is updated, sync to club_memberships
  IF NEW.user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM club_memberships
      WHERE member_id = NEW.user_id
      AND club_id = NEW.club_id
    ) THEN
      UPDATE club_memberships
      SET
        status = CASE 
          WHEN NEW.membership_status = 'active' THEN 'active'
          WHEN NEW.membership_status = 'expired' THEN 'expired'
          WHEN NEW.membership_status = 'pending' THEN 'pending'
          WHEN NEW.membership_status = 'archived' THEN 'archived'
          ELSE 'active'
        END,
        joined_date = NEW.date_joined,
        expiry_date = NEW.renewal_date,
        payment_status = CASE 
          WHEN NEW.is_financial = true THEN 'paid'
          WHEN NEW.payment_status = 'paid' THEN 'paid'
          WHEN NEW.payment_status = 'partial' THEN 'partial'
          WHEN NEW.payment_status = 'overdue' THEN 'overdue'
          ELSE 'unpaid'
        END,
        updated_at = now()
      WHERE member_id = NEW.user_id
      AND club_id = NEW.club_id;
    ELSE
      -- Create new club_membership if it doesn't exist
      INSERT INTO club_memberships (
        member_id,
        club_id,
        relationship_type,
        status,
        joined_date,
        expiry_date,
        payment_status,
        pays_association_fees
      ) VALUES (
        NEW.user_id,
        NEW.club_id,
        'primary',
        CASE 
          WHEN NEW.membership_status = 'active' THEN 'active'
          WHEN NEW.membership_status = 'expired' THEN 'expired'
          WHEN NEW.membership_status = 'pending' THEN 'pending'
          ELSE 'active'
        END,
        NEW.date_joined,
        NEW.renewal_date,
        CASE 
          WHEN NEW.is_financial = true THEN 'paid'
          ELSE 'unpaid'
        END,
        true
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to keep members and club_memberships in sync
DROP TRIGGER IF EXISTS trigger_sync_member_to_club_membership ON members;
CREATE TRIGGER trigger_sync_member_to_club_membership
  AFTER INSERT OR UPDATE ON members
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION sync_member_to_club_membership();

-- Function to sync club_membership updates back to members (for backward compatibility)
CREATE OR REPLACE FUNCTION sync_club_membership_to_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only sync primary memberships back to members table
  IF NEW.relationship_type = 'primary' THEN
    UPDATE members
    SET
      membership_status = CASE 
        WHEN NEW.status = 'active' THEN 'active'
        WHEN NEW.status = 'expired' THEN 'expired'
        WHEN NEW.status = 'pending' THEN 'pending'
        WHEN NEW.status = 'archived' THEN 'archived'
        ELSE 'active'
      END,
      date_joined = NEW.joined_date,
      renewal_date = NEW.expiry_date,
      is_financial = CASE 
        WHEN NEW.payment_status = 'paid' THEN true
        ELSE false
      END,
      payment_status = NEW.payment_status,
      updated_at = now()
    WHERE user_id = NEW.member_id
    AND club_id = NEW.club_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to keep club_memberships and members in sync
DROP TRIGGER IF EXISTS trigger_sync_club_membership_to_member ON club_memberships;
CREATE TRIGGER trigger_sync_club_membership_to_member
  AFTER UPDATE ON club_memberships
  FOR EACH ROW
  WHEN (NEW.relationship_type = 'primary')
  EXECUTE FUNCTION sync_club_membership_to_member();
