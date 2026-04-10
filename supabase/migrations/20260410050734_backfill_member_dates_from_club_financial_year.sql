/*
  # Backfill member dates from club financial year settings

  1. Problem
    - Members imported via CSV without date information have NULL date_joined and renewal_date
    - This causes the UI to display "01/01/1970" for date_joined (JavaScript epoch date)
    - Missing renewal_date means the renewal reminder system will not work for these members

  2. Fix
    - For clubs with fixed renewal mode (e.g., July 1st financial year):
      - Set date_joined to the start of the current financial year
      - Set renewal_date to the end of the current financial year (day before next start)
    - For clubs with anniversary renewal mode:
      - Set date_joined to today
      - Set renewal_date to one year from today

  3. Impact
    - All existing members with missing dates will get appropriate financial year dates
    - Renewal reminders will work correctly going forward
    - Only updates members who currently have NULL dates
*/

DO $$
DECLARE
  v_club RECORD;
  v_fy_start DATE;
  v_fy_end DATE;
  v_fy_month INT;
  v_fy_day INT;
  v_now DATE := CURRENT_DATE;
  v_updated INT;
BEGIN
  FOR v_club IN
    SELECT id, name, renewal_mode, fixed_renewal_date
    FROM public.clubs
    WHERE id IN (
      SELECT DISTINCT club_id FROM public.members
      WHERE (date_joined IS NULL OR renewal_date IS NULL)
        AND membership_status != 'archived'
    )
  LOOP
    IF v_club.renewal_mode = 'fixed' AND v_club.fixed_renewal_date IS NOT NULL THEN
      v_fy_month := SPLIT_PART(v_club.fixed_renewal_date, '-', 1)::INT;
      v_fy_day := SPLIT_PART(v_club.fixed_renewal_date, '-', 2)::INT;

      v_fy_start := MAKE_DATE(EXTRACT(YEAR FROM v_now)::INT, v_fy_month, v_fy_day);
      IF v_fy_start > v_now THEN
        v_fy_start := MAKE_DATE(EXTRACT(YEAR FROM v_now)::INT - 1, v_fy_month, v_fy_day);
      END IF;
      v_fy_end := v_fy_start + INTERVAL '1 year' - INTERVAL '1 day';
    ELSE
      v_fy_start := v_now;
      v_fy_end := v_now + INTERVAL '1 year';
    END IF;

    UPDATE public.members
    SET
      date_joined = COALESCE(date_joined, v_fy_start),
      renewal_date = COALESCE(renewal_date, v_fy_end),
      updated_at = now()
    WHERE club_id = v_club.id
      AND (date_joined IS NULL OR renewal_date IS NULL)
      AND membership_status != 'archived';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE LOG 'Backfilled % members for club %', v_updated, v_club.name;
  END LOOP;
END $$;
