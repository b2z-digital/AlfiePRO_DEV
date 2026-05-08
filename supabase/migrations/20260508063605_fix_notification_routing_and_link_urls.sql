/*
  # Fix notification routing issues

  1. Membership Application Notifications
    - Update `notify_admins_on_new_application()` to only notify admins who are
      actual members of the club (have a record in the members table)
    - This excludes state/national admins who were auto-synced to user_clubs
      with 'admin' role but are not real club members

  2. Race Results Notification Link URLs
    - Fix `notify_race_completed()` to use `/results/{id}` instead of `/results/event/{id}`
    - Fix `notify_series_round_completed()` to use `/results/{id}` instead of `/results/series/{id}`
    - The app router uses `/results/:id` and determines type at runtime

  3. Impact
    - Membership application inquiries and new application notifications will only
      go to genuine club admins, not state/national admins with auto-synced access
    - "View Item" buttons on race result notifications will correctly navigate to
      the results page instead of falling back to the dashboard
*/

-- Fix notify_admins_on_new_application to exclude auto-synced state/national admins
CREATE OR REPLACE FUNCTION notify_admins_on_new_application()
RETURNS TRIGGER AS $$
DECLARE
  admin_record RECORD;
  applicant_name TEXT;
BEGIN
  IF NEW.is_draft = false AND NEW.status = 'pending' THEN
    applicant_name := NEW.first_name || ' ' || NEW.last_name;

    -- Only notify admins who are actual members of the club
    FOR admin_record IN
      SELECT DISTINCT uc.user_id, p.full_name, p.avatar_url
      FROM user_clubs uc
      LEFT JOIN profiles p ON p.id = uc.user_id
      WHERE uc.club_id = NEW.club_id
        AND uc.role IN ('admin', 'super_admin')
        AND EXISTS (
          SELECT 1 FROM members m
          WHERE m.user_id = uc.user_id
            AND m.club_id = NEW.club_id
        )
    LOOP
      INSERT INTO notifications (
        user_id,
        club_id,
        type,
        subject,
        body,
        read,
        sender_id,
        sender_name,
        sender_avatar_url,
        recipient_name,
        recipient_avatar_url,
        created_at
      ) VALUES (
        admin_record.user_id,
        NEW.club_id,
        'membership_application',
        'New Membership Application',
        applicant_name || ' has submitted a membership application for ' || COALESCE(NEW.membership_type_name, 'membership') || '.',
        false,
        NEW.user_id,
        applicant_name,
        NEW.avatar_url,
        admin_record.full_name,
        admin_record.avatar_url,
        NOW()
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Fix notify_race_completed to use correct link_url path
CREATE OR REPLACE FUNCTION notify_race_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) AND NEW.club_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, club_id, type, subject, body, notification_category, push_status, link_url)
    SELECT
      uc.user_id,
      NEW.club_id,
      'race_results',
      'Race Results Posted',
      'Results for ' || COALESCE(NEW.event_name, 'race on ' || NEW.race_date) || ' are now available.',
      'race_results',
      'pending',
      '/results/' || NEW.id
    FROM user_clubs uc
    LEFT JOIN user_notification_preferences unp ON unp.user_id = uc.user_id
    WHERE uc.club_id = NEW.club_id
      AND EXISTS (
        SELECT 1 FROM members m
        WHERE m.user_id = uc.user_id
          AND m.club_id = NEW.club_id
      )
      AND (unp.notify_race_results IS NULL OR unp.notify_race_results = true)
      AND (unp.push_notifications IS NULL OR unp.push_notifications = true);
  END IF;
  RETURN NEW;
END;
$$;

-- Fix notify_series_round_completed to use correct link_url path
CREATE OR REPLACE FUNCTION notify_series_round_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series_name text;
BEGIN
  IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) AND NEW.club_id IS NOT NULL THEN
    SELECT series_name INTO v_series_name
    FROM race_series WHERE id = NEW.series_id;

    INSERT INTO notifications (user_id, club_id, type, subject, body, notification_category, push_status, link_url)
    SELECT
      uc.user_id,
      NEW.club_id,
      'race_results',
      'Results Posted: ' || COALESCE(NEW.round_name, 'Round ' || NEW.round_index),
      'Results for ' || COALESCE(NEW.round_name, 'Round ' || NEW.round_index)
        || ' of ' || COALESCE(v_series_name, 'series')
        || ' are now available.',
      'race_results',
      'pending',
      '/results/' || NEW.series_id
    FROM user_clubs uc
    LEFT JOIN user_notification_preferences unp ON unp.user_id = uc.user_id
    WHERE uc.club_id = NEW.club_id
      AND EXISTS (
        SELECT 1 FROM members m
        WHERE m.user_id = uc.user_id
          AND m.club_id = NEW.club_id
      )
      AND (unp.notify_race_results IS NULL OR unp.notify_race_results = true)
      AND (unp.push_notifications IS NULL OR unp.push_notifications = true);
  END IF;
  RETURN NEW;
END;
$$;

-- Also fix existing notifications with incorrect link_url patterns
UPDATE notifications
SET link_url = '/results/' || SUBSTRING(link_url FROM '/results/event/(.+)$')
WHERE link_url LIKE '/results/event/%';

UPDATE notifications
SET link_url = '/results/' || SUBSTRING(link_url FROM '/results/series/(.+)$')
WHERE link_url LIKE '/results/series/%';
