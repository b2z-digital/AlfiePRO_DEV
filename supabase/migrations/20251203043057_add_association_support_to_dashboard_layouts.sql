/*
  # Add Association Support to Dashboard Layouts

  1. Changes
    - Add `state_association_id` column to `user_dashboard_layouts`
    - Add `national_association_id` column to `user_dashboard_layouts`
    - Update unique constraint to include associations
    - Drop old constraint and create new one

  2. Security
    - No RLS changes needed
*/

-- Add columns for associations
ALTER TABLE user_dashboard_layouts
ADD COLUMN IF NOT EXISTS state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE;

-- Drop old unique constraint
ALTER TABLE user_dashboard_layouts
DROP CONSTRAINT IF EXISTS user_dashboard_layouts_user_id_club_id_is_default_key;

-- Create new unique constraint that includes associations
-- Only one of club_id, state_association_id, or national_association_id should be set
ALTER TABLE user_dashboard_layouts
ADD CONSTRAINT user_dashboard_layouts_unique_layout 
UNIQUE (user_id, club_id, state_association_id, national_association_id, is_default);

-- Add check constraint to ensure only one organization type is set
ALTER TABLE user_dashboard_layouts
ADD CONSTRAINT user_dashboard_layouts_one_org_type 
CHECK (
  (club_id IS NOT NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
  (club_id IS NULL AND state_association_id IS NOT NULL AND national_association_id IS NULL) OR
  (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NOT NULL) OR
  (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL)
);
