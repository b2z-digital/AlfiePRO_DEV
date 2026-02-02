/*
  # Backfill enable_livestream for series rounds
  
  1. Updates
    - Sets enable_livestream on race_series_rounds to match parent series value
    - Only updates rounds where enable_livestream is NULL or FALSE
  
  2. Purpose
    - Ensures existing series rounds inherit livestream setting from parent series
    - Fixes rounds created before livestream inheritance was implemented
*/

-- Backfill enable_livestream from parent series to rounds
UPDATE race_series_rounds rsr
SET enable_livestream = rs.enable_livestream
FROM race_series rs
WHERE rsr.series_id = rs.id
  AND rs.enable_livestream = true
  AND (rsr.enable_livestream IS NULL OR rsr.enable_livestream = false);