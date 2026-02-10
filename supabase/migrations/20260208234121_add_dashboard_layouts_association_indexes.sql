/*
  # Add Indexes for Association Dashboard Layouts

  1. Changes
    - Add indexes for state_association_id and national_association_id
    - These improve query performance when loading/saving association dashboards

  2. Security
    - No changes to RLS policies (they already work correctly)
*/

-- Add indexes for faster lookups on association columns
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_state_assoc 
ON user_dashboard_layouts(user_id, state_association_id) 
WHERE state_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_national_assoc 
ON user_dashboard_layouts(user_id, national_association_id) 
WHERE national_association_id IS NOT NULL;

-- Add indexes for the association ID columns alone (for foreign key lookups)
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_state_assoc_id 
ON user_dashboard_layouts(state_association_id) 
WHERE state_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_national_assoc_id 
ON user_dashboard_layouts(national_association_id) 
WHERE national_association_id IS NOT NULL;
