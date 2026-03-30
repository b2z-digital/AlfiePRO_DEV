/*
  # Fix notify_article_published trigger column reference

  1. Changes
    - Fix `notify_article_published()` function that references `NEW.summary`
      which does not exist on the `articles` table
    - The correct column name is `excerpt`
    - This bug would cause a runtime error whenever an article was published,
      preventing the publish action from completing

  2. Impact
    - Fixes article publishing for all users
    - Notifications will now correctly include the article excerpt
*/

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
        AND (unp.notify_news IS NULL OR unp.notify_news = true)
        AND (unp.push_notifications IS NULL OR unp.push_notifications = true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
