/*
  # PRO names on public club pages + automatic PRO duty reminders

  1. get_public_pro_assignments(p_club_id)
     - SECURITY DEFINER, names only. Lets the public club website show the PRO for each
       series round (pro_rosters → rounds → assignments) and single event (roster with
       event_id, or quick_races.pro_member_name). Same data the logged-in calendar shows.
     - EXECUTE granted to anon and authenticated.

  2. send_pro_duty_reminders()
     - Finds PROs with a duty in the next N days (N = roster.reminder_days_before, default 7)
       that have not been reminded yet, and sends each one an email and/or in-app notice
       through the existing send-notification edge function (via pg_net, service role from
       the vault, same pattern as the other cron jobs).
     - Series/roster duties: pro_roster_assignments (active rosters, assigned/confirmed).
     - Single events without a roster: quick_races.pro_member_id.
     - Idempotent: stamps pro_roster_assignments.reminder_sent_at /
       quick_races.pro_reminder_sent_at so nobody is reminded twice.
     - reminder_type: 'email' = email only, 'notification' = in-app only, 'both' = both.

  3. Cron: daily-pro-duty-reminders at 21:00 UTC (8am Sydney in daylight time, 7am otherwise).

  Why: PRO duty tasks were created with reminder settings, but nothing ever sent them.
  send-task-reminders only looks at document_* tasks, matches members by user_id,
  never actually sends email, and had no cron job.
*/

-- ── 1. Public PRO names ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_pro_assignments(p_club_id uuid)
RETURNS TABLE (series_id text, event_id text, duty_date date, member_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ro.series_id,
         ro.event_id,
         rr.date,
         NULLIF(trim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), '')
  FROM pro_rosters ro
  JOIN pro_roster_rounds rr ON rr.roster_id = ro.id
  JOIN pro_roster_assignments a ON a.round_id = rr.id AND a.status IN ('assigned', 'confirmed')
  LEFT JOIN members m ON m.id::text = a.member_id
  WHERE ro.club_id = p_club_id::text
    AND ro.status IN ('active', 'draft')
  UNION ALL
  SELECT NULL::text, q.id::text, NULL::date, q.pro_member_name
  FROM quick_races q
  WHERE q.club_id::text = p_club_id::text
    AND coalesce(q.pro_member_name, '') <> '';
$$;

REVOKE ALL ON FUNCTION public.get_public_pro_assignments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pro_assignments(uuid) TO anon, authenticated;

-- ── 2. Reminder bookkeeping ─────────────────────────────────────────────────
ALTER TABLE public.pro_roster_assignments ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
ALTER TABLE public.quick_races ADD COLUMN IF NOT EXISTS pro_reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.send_pro_duty_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url   text;
  v_key   text;
  v_today date := (now() AT TIME ZONE 'Australia/Sydney')::date;
  v_count integer := 0;
  r       record;
  v_title text;
  v_when  text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'send_pro_duty_reminders: vault secrets supabase_url / service_role_key are missing';
    RETURN 0;
  END IF;

  FOR r IN
    -- Roster duties (series rounds and single events with a roster)
    SELECT 'roster'::text AS src,
           a.id AS ref_id,
           rr.date AS duty_date,
           coalesce(nullif(rr.name, ''), ro.name) AS duty_title,
           ro.name AS context_name,
           coalesce(ro.reminder_type, 'both') AS reminder_type,
           ro.club_id AS club_id,
           m.email, m.first_name, m.last_name, m.user_id,
           c.name AS club_name, c.logo AS club_logo
    FROM pro_roster_assignments a
    JOIN pro_roster_rounds rr ON rr.id = a.round_id
    JOIN pro_rosters ro ON ro.id = a.roster_id
    JOIN members m ON m.id::text = a.member_id
    LEFT JOIN clubs c ON c.id::text = ro.club_id
    WHERE a.status IN ('assigned', 'confirmed')
      AND a.reminder_sent_at IS NULL
      AND ro.status = 'active'
      AND rr.date >= v_today
      AND rr.date <= v_today + coalesce(nullif(ro.reminder_days_before, 0), 7)

    UNION ALL

    -- Single events with a PRO picked on the event (no roster for that event)
    SELECT 'quick'::text,
           q.id,
           q.race_date::date,
           coalesce(nullif(q.event_name, ''), 'Club race'),
           NULL::text,
           'both'::text,
           q.club_id::text,
           m.email, m.first_name, m.last_name, m.user_id,
           c.name, c.logo
    FROM quick_races q
    JOIN members m ON m.id = q.pro_member_id
    LEFT JOIN clubs c ON c.id::text = q.club_id::text
    WHERE q.pro_member_id IS NOT NULL
      AND q.pro_reminder_sent_at IS NULL
      AND coalesce(q.is_simulated, false) = false
      AND coalesce(q.completed, false) = false
      AND q.race_date::text ~ '^\d{4}-\d{2}-\d{2}'
      AND q.race_date::date >= v_today
      AND q.race_date::date <= v_today + 7
      AND NOT EXISTS (
        SELECT 1 FROM pro_rosters ro2
        WHERE ro2.event_id = q.id::text AND ro2.status IN ('active', 'draft')
      )
  LOOP
    IF r.email IS NULL AND r.user_id IS NULL THEN
      CONTINUE;
    END IF;

    v_when  := to_char(r.duty_date, 'FMDay FMDD FMMonth YYYY');
    v_title := r.duty_title || CASE WHEN r.context_name IS NOT NULL AND r.context_name <> r.duty_title
                                    THEN ' (' || r.context_name || ')' ELSE '' END;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'recipients', jsonb_build_array(jsonb_build_object(
          'email', r.email,
          'name', trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')),
          'user_id', r.user_id
        )),
        'subject', 'PRO reminder: ' || r.duty_title || ' on ' || to_char(r.duty_date, 'FMDD FMMon'),
        'body', format(
          '<p>Hi %s,</p>'
          '<p>This is a reminder that you are the <strong>Principal Race Officer (PRO)</strong> for '
          '<strong>%s</strong> on <strong>%s</strong>.</p>'
          '<p>If you can no longer make it, please let your club know or arrange a swap in AlfiePRO as soon as possible.</p>'
          '<p>Thanks for helping run the racing!</p>',
          coalesce(nullif(r.first_name, ''), 'there'), v_title, v_when
        ),
        'type', 'pro_roster_assignment',
        'club_id', r.club_id,
        'club_name', r.club_name,
        'club_logo', r.club_logo,
        'sender_name', coalesce(r.club_name, 'AlfiePRO'),
        'send_email', r.reminder_type IN ('email', 'both'),
        'skip_notifications', r.reminder_type = 'email'
      )
    );

    IF r.src = 'roster' THEN
      UPDATE pro_roster_assignments SET reminder_sent_at = now() WHERE id = r.ref_id;
    ELSE
      UPDATE quick_races SET pro_reminder_sent_at = now() WHERE id = r.ref_id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.send_pro_duty_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_pro_duty_reminders() FROM anon, authenticated;

-- ── 3. Daily schedule ───────────────────────────────────────────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-pro-duty-reminders';
SELECT cron.schedule(
  'daily-pro-duty-reminders',
  '0 21 * * *',
  $$SELECT public.send_pro_duty_reminders();$$
);
