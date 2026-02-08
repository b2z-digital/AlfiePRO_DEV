/*
  # Clean Up Duplicate Dashboard Layouts

  1. Purpose
    - Remove duplicate dashboard layouts that might have been created
    - Keep only the most recent layout for each user/organization combination
    - Ensures the unique constraint can work properly

  2. Process
    - Find all duplicate layouts (same user_id + organization context + is_default)
    - Keep the newest one (by created_at)
    - Delete the rest

  3. Security
    - No RLS changes
*/

-- Clean up duplicates for club-based layouts
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, club_id, is_default
      ORDER BY created_at DESC, updated_at DESC
    ) as rn
  FROM user_dashboard_layouts
  WHERE club_id IS NOT NULL
    AND state_association_id IS NULL
    AND national_association_id IS NULL
)
DELETE FROM user_dashboard_layouts
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Clean up duplicates for state association layouts
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, state_association_id, is_default
      ORDER BY created_at DESC, updated_at DESC
    ) as rn
  FROM user_dashboard_layouts
  WHERE state_association_id IS NOT NULL
    AND club_id IS NULL
    AND national_association_id IS NULL
)
DELETE FROM user_dashboard_layouts
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Clean up duplicates for national association layouts
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, national_association_id, is_default
      ORDER BY created_at DESC, updated_at DESC
    ) as rn
  FROM user_dashboard_layouts
  WHERE national_association_id IS NOT NULL
    AND club_id IS NULL
    AND state_association_id IS NULL
)
DELETE FROM user_dashboard_layouts
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Clean up duplicates for global layouts (no organization)
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, is_default
      ORDER BY created_at DESC, updated_at DESC
    ) as rn
  FROM user_dashboard_layouts
  WHERE club_id IS NULL
    AND state_association_id IS NULL
    AND national_association_id IS NULL
)
DELETE FROM user_dashboard_layouts
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Log the cleanup
DO $$
DECLARE
  total_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM user_dashboard_layouts;
  RAISE NOTICE 'Dashboard layouts cleanup complete. Total layouts remaining: %', total_rows;
END $$;
