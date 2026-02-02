-- Fix dropRules for the "10R Handicap Club Championship Series - 2026" event
-- This updates the event to use the default RRS Appendix A drop rules

UPDATE quick_races
SET drop_rules = '[4, 8, 16, 24, 32, 40]'::jsonb
WHERE event_name = '10R Handicap Club Championship Series - 2026'
  AND (drop_rules IS NULL OR drop_rules::text = '[]');

-- Verify the update
SELECT
  id,
  event_name,
  drop_rules,
  updated_at
FROM quick_races
WHERE event_name = '10R Handicap Club Championship Series - 2026';
