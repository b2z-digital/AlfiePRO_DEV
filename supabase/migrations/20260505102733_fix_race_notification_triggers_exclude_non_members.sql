/*
  # Fix race notification triggers to only notify actual club members

  1. Problem
    - State and national admins are automatically added to `user_clubs` for every
      club under their association (for administrative access purposes)
    - The race completion notification triggers query `user_clubs` to find recipients,
      which means state admins receive "Race Results Posted" notifications from EVERY
      club - even ones they are not actually a member of
    - Similarly, the article published notification has the same issue

  2. Fix
    - Update `notify_race_completed()` to require a matching `members` record
      (proving the user is an actual member of that club, not just an admin)
    - Update `notify_series_round_completed()` with the same fix
    - Update `notify_article_published()` with the same fix
    - Users who are both state admins AND actual members will still receive notifications

  3. Impact
    - State/national admins will no longer be spammed with notifications from
      every club under their association
    - Only users who are actual members of a club will receive race result and
      news notifications from that club
*/

-- Fix notify_race_completed to only notify actual club members
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
      '/results/event/' || NEW.id
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

-- Fix notify_series_round_completed to only notify actual club members
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
      '/results/series/' || NEW.series_id
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

-- Fix notify_article_published to only notify actual club members
CREATE OR REPLACE FUNCTION notify_article_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  IF NEW.status = 'published' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'published') THEN
    v_club_id := NEW.club_id;

    IF v_club_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, club_id, type, subject, body, notification_category, push_status, link_url)
      SELECT
        uc.user_id,
        v_club_id,
        'general',
        'News: ' || NEW.title,
        COALESCE(NEW.excerpt, LEFT(NEW.content, 200)),
        'news',
        'pending',
        '/news/article/' || NEW.id
      FROM user_clubs uc
      LEFT JOIN user_notification_preferences unp ON unp.user_id = uc.user_id
      WHERE uc.club_id = v_club_id
        AND EXISTS (
          SELECT 1 FROM members m
          WHERE m.user_id = uc.user_id
            AND m.club_id = v_club_id
        )
        AND (unp.notify_news IS NULL OR unp.notify_news = true)
        AND (unp.push_notifications IS NULL OR unp.push_notifications = true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
