/*
# Remove duplicate standalone copy of a series round and prevent recurrence

1. Background
- An offline-sync bug copied Patterson Lakes "Round 5 - DF65 Thursday Handicap" (a series round in
  `race_series_rounds`) into `quick_races` under the same id, so it showed twice in Results.
- The copy is identical (same 56 results, same skippers) and has no linked rows.

2. New Tables
- `quick_races_removed_duplicates`: backup of removed duplicate rows (full row as jsonb + removed_at).
  RLS enabled with no policies, so only administrators can read it.

3. Data changes
- Back up, then delete the quick_races row whose id equals an existing race_series_rounds id.

4. Safeguard
- BEFORE INSERT trigger on `quick_races` rejects any id that already belongs to a series round.
*/

CREATE TABLE IF NOT EXISTS quick_races_removed_duplicates (
  id uuid PRIMARY KEY,
  row_data jsonb NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quick_races_removed_duplicates ENABLE ROW LEVEL SECURITY;

INSERT INTO quick_races_removed_duplicates (id, row_data)
SELECT q.id, to_jsonb(q) FROM quick_races q
WHERE EXISTS (SELECT 1 FROM race_series_rounds r WHERE r.id = q.id)
ON CONFLICT (id) DO NOTHING;

DELETE FROM quick_races q
WHERE EXISTS (SELECT 1 FROM race_series_rounds r WHERE r.id = q.id)
  AND EXISTS (SELECT 1 FROM quick_races_removed_duplicates b WHERE b.id = q.id);

CREATE OR REPLACE FUNCTION prevent_series_round_quick_race()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM race_series_rounds WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Event % is a series round and cannot be stored as a standalone event', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_series_round_quick_race_trigger ON quick_races;
CREATE TRIGGER prevent_series_round_quick_race_trigger
BEFORE INSERT ON quick_races
FOR EACH ROW EXECUTE FUNCTION prevent_series_round_quick_race();
