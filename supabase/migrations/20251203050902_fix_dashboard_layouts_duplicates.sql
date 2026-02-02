/*
  # Fix Dashboard Layouts Duplicates

  1. Problem
    - Multiple dashboard layout rows exist for the same user + organization combination
    - This causes loading to fail with "multiple rows returned" error
    - The unique constraint isn't preventing duplicates properly

  2. Solution
    - Delete duplicate rows, keeping only the most recent one (by updated_at)
    - For each user + organization combination, keep only the latest layout

  3. Security
    - No RLS changes needed
*/

-- Delete duplicate dashboard layouts, keeping only the most recent one for each user + organization combo
WITH ranked_layouts AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, club_id, state_association_id, national_association_id, is_default 
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) as rn
  FROM user_dashboard_layouts
)
DELETE FROM user_dashboard_layouts
WHERE id IN (
  SELECT id FROM ranked_layouts WHERE rn > 1
);

-- Log how many layouts remain
DO $$
DECLARE
  layout_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO layout_count FROM user_dashboard_layouts;
  RAISE NOTICE 'Dashboard layouts after cleanup: %', layout_count;
END $$;
