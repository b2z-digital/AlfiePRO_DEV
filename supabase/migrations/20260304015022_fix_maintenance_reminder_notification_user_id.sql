/*
  # Fix maintenance reminder notification trigger

  ## Problem
  The `notify_maintenance_reminder_due` trigger function was using `member_id`
  (from `member_boats`) as the `user_id` when inserting into `notifications`.
  The `notifications.user_id` column has a foreign key to `auth.users`, so
  using `member_id` (which is a `members` table ID) caused a FK violation,
  preventing maintenance logs from being saved when `next_service_date` is set.

  ## Fix
  - Join `member_boats` to `members` to retrieve the actual `user_id` (auth user ID)
  - Only insert notification if the member has a linked auth user account
  - This also fixes the same issue for saves from the mobile app
*/

CREATE OR REPLACE FUNCTION notify_maintenance_reminder_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_boat_type text;
  v_display_name text;
  v_due_text text;
BEGIN
  IF NEW.is_active = true AND NEW.is_completed = false THEN
    SELECT m.user_id, mb.boat_type, COALESCE(mb.hull, mb.boat_name, mb.boat_type)
    INTO v_user_id, v_boat_type, v_display_name
    FROM member_boats mb
    JOIN members m ON m.id = mb.member_id
    WHERE mb.id = NEW.boat_id;

    IF v_user_id IS NOT NULL THEN
      v_due_text := CASE
        WHEN NEW.due_date IS NOT NULL THEN ' due ' || to_char(NEW.due_date, 'DD Mon YYYY')
        ELSE ''
      END;

      INSERT INTO notifications (
        user_id, type, subject, body,
        notification_category, push_status,
        link_url
      )
      VALUES (
        v_user_id,
        'maintenance',
        'Maintenance Reminder: ' || v_display_name,
        NEW.title || v_due_text,
        'maintenance',
        'pending',
        '/boats/' || NEW.boat_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
