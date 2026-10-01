/*
# Link committee positions to member logins so position access is applied

## Problem
Committee positions are often assigned to a member record (member_id) without the
login (user_id). Position access (Admin/Editor/Race Scorer) is synced to user_clubs
using user_id only, so those positions granted nothing.

## Changes
1. New BEFORE INSERT/UPDATE trigger on committee_positions fills user_id from
   members.user_id when it is missing.
2. New AFTER UPDATE trigger on members: when a member gains a login, their
   unlinked positions are linked.
3. Access sync trigger now also runs when committee_positions.user_id changes, and
   skips rows without a user.
4. Backfill: link existing positions, then raise (never lower) user_clubs roles to
   the highest position access level for affected users.

## Security
No RLS changes. Functions are SECURITY DEFINER with fixed search_path.
*/

CREATE OR REPLACE FUNCTION public.fill_committee_position_user_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.member_id IS NOT NULL THEN
    SELECT m.user_id INTO NEW.user_id FROM members m WHERE m.id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_committee_position_user_id_trigger ON public.committee_positions;
CREATE TRIGGER fill_committee_position_user_id_trigger
BEFORE INSERT OR UPDATE OF member_id, user_id ON public.committee_positions
FOR EACH ROW EXECUTE FUNCTION public.fill_committee_position_user_id();

CREATE OR REPLACE FUNCTION public.link_committee_positions_on_member_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    UPDATE committee_positions SET user_id = NEW.user_id
    WHERE member_id = NEW.id AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_committee_positions_on_member_login_trigger ON public.members;
CREATE TRIGGER link_committee_positions_on_member_login_trigger
AFTER UPDATE OF user_id ON public.members
FOR EACH ROW EXECUTE FUNCTION public.link_committee_positions_on_member_login();

-- Backfill links before the sync trigger listens to updates, so no role is lowered here.
UPDATE committee_positions cp SET user_id = m.user_id
FROM members m
WHERE m.id = cp.member_id AND cp.user_id IS NULL AND m.user_id IS NOT NULL;

WITH best AS (
  SELECT cp.user_id, d.club_id,
    CASE WHEN bool_or(d.access_level = 'admin') THEN 3
         WHEN bool_or(d.access_level = 'editor') THEN 2
         WHEN bool_or(d.access_level = 'race_scorer') THEN 1
         ELSE 0 END AS rank
  FROM committee_positions cp
  JOIN committee_position_definitions d ON d.id = cp.position_definition_id
  WHERE d.club_id IS NOT NULL AND cp.user_id IS NOT NULL
  GROUP BY cp.user_id, d.club_id
), target AS (
  SELECT user_id, club_id,
    (CASE rank WHEN 3 THEN 'admin' WHEN 2 THEN 'editor' WHEN 1 THEN 'race_scorer' END)::club_role AS role, rank
  FROM best WHERE rank > 0
)
INSERT INTO user_clubs (user_id, club_id, role)
SELECT user_id, club_id, role FROM target
ON CONFLICT (user_id, club_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()
WHERE (CASE user_clubs.role::text WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'race_scorer' THEN 1 ELSE 0 END)
      < (CASE EXCLUDED.role::text WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 WHEN 'race_scorer' THEN 1 ELSE 0 END);

CREATE OR REPLACE FUNCTION public.sync_committee_access_to_user_clubs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
v_user_id UUID;
v_scope_id UUID;
v_scope_type TEXT;
v_highest_access TEXT;
v_new_role TEXT;
v_def_id UUID;
BEGIN
IF TG_OP = 'DELETE' THEN
  v_user_id := OLD.user_id;
  v_def_id := OLD.position_definition_id;
ELSE
  v_user_id := NEW.user_id;
  v_def_id := NEW.position_definition_id;
END IF;

IF v_user_id IS NULL THEN
  RETURN COALESCE(NEW, OLD);
END IF;

SELECT
  CASE WHEN cpd.club_id IS NOT NULL THEN 'club'
       WHEN cpd.state_association_id IS NOT NULL THEN 'state'
       WHEN cpd.national_association_id IS NOT NULL THEN 'national' END,
  COALESCE(cpd.club_id, cpd.state_association_id, cpd.national_association_id)
INTO v_scope_type, v_scope_id
FROM committee_position_definitions cpd
WHERE cpd.id = v_def_id;

IF v_scope_type IS NULL OR v_scope_id IS NULL THEN
  RETURN COALESCE(NEW, OLD);
END IF;

SELECT
  CASE WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
       WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
       WHEN bool_or(cpd.access_level = 'race_scorer') THEN 'race_scorer'
       ELSE 'viewer' END
INTO v_highest_access
FROM committee_positions cp
JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
WHERE cp.user_id = v_user_id
AND COALESCE(cpd.club_id, cpd.state_association_id, cpd.national_association_id) = v_scope_id;

IF v_highest_access IS NULL THEN
  v_highest_access := 'viewer';
END IF;

IF v_scope_type = 'club' THEN
  IF v_highest_access = 'admin' THEN v_new_role := 'admin';
  ELSIF v_highest_access = 'editor' THEN v_new_role := 'editor';
  ELSIF v_highest_access = 'race_scorer' THEN v_new_role := 'race_scorer';
  ELSE v_new_role := 'member';
  END IF;

  INSERT INTO user_clubs (user_id, club_id, role)
  VALUES (v_user_id, v_scope_id, v_new_role::club_role)
  ON CONFLICT (user_id, club_id) DO UPDATE SET role = v_new_role::club_role, updated_at = now();

ELSIF v_scope_type = 'state' THEN
  IF v_highest_access = 'admin' THEN v_new_role := 'state_admin';
  ELSIF v_highest_access = 'editor' THEN v_new_role := 'editor';
  ELSIF v_highest_access = 'race_scorer' THEN v_new_role := 'race_scorer';
  ELSE v_new_role := 'member';
  END IF;

  UPDATE user_state_associations SET role = v_new_role::club_role, updated_at = now()
  WHERE user_id = v_user_id AND state_association_id = v_scope_id;

ELSIF v_scope_type = 'national' THEN
  IF v_highest_access = 'admin' THEN v_new_role := 'national_admin';
  ELSIF v_highest_access = 'editor' THEN v_new_role := 'editor';
  ELSIF v_highest_access = 'race_scorer' THEN v_new_role := 'race_scorer';
  ELSE v_new_role := 'member';
  END IF;

  UPDATE user_national_associations SET role = v_new_role::club_role, updated_at = now()
  WHERE user_id = v_user_id AND national_association_id = v_scope_id;
END IF;

RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS sync_committee_access_trigger ON public.committee_positions;
CREATE TRIGGER sync_committee_access_trigger
AFTER INSERT OR DELETE OR UPDATE OF user_id ON public.committee_positions
FOR EACH ROW EXECUTE FUNCTION public.sync_committee_access_to_user_clubs();