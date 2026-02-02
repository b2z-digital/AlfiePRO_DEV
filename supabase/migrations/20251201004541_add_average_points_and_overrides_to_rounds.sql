/*
  # Add Average Points and Score Overrides to Race Series Rounds

  1. Changes
    - Add `average_points_applied` JSONB column to `race_series_rounds` table
      Stores mapping of skipper index to average points applied (e.g., {"0": 2, "3": 5})
    - Add `manual_score_overrides` JSONB column to `race_series_rounds` table
      Stores mapping of skipper index to manually edited scores (e.g., {"0": 3, "1": 4})

  2. Purpose
    - Allows race officers to apply average points to skippers who missed a round
    - Allows manual correction of scores when needed
    - These values override the calculated scores from race results
*/

-- Add average_points_applied column
ALTER TABLE race_series_rounds
ADD COLUMN IF NOT EXISTS average_points_applied jsonb DEFAULT '{}'::jsonb;

-- Add manual_score_overrides column
ALTER TABLE race_series_rounds
ADD COLUMN IF NOT EXISTS manual_score_overrides jsonb DEFAULT '{}'::jsonb;
