/*
  # Fix social_post_reports foreign keys for profile joins

  ## Problem
  The `social_post_reports` table has `reporter_id` and `reviewed_by` columns
  with foreign keys pointing only to `auth.users`. PostgREST cannot resolve
  joins to the `profiles` table through `auth.users` FKs, causing the query
  in `getPostReports()` to fail silently. This means reported posts never
  appear in the admin review panel.

  ## Fix
  - Add FK from `reporter_id` to `profiles(id)` so PostgREST can join
  - Add FK from `reviewed_by` to `profiles(id)` so PostgREST can join
  - This follows the same pattern used in `social_posts.author_id`
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_post_reports_reporter_id_profiles_fkey'
  ) THEN
    ALTER TABLE social_post_reports
      ADD CONSTRAINT social_post_reports_reporter_id_profiles_fkey
      FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_post_reports_reviewed_by_profiles_fkey'
  ) THEN
    ALTER TABLE social_post_reports
      ADD CONSTRAINT social_post_reports_reviewed_by_profiles_fkey
      FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
