/*
# Protect scored results and let Race Scorers save series scoring

## Problem
1. Race Scorers could save quick races but not series rounds or scoring checkpoints,
   so their series scoring never reached the database.
2. A save with an empty skipper list could overwrite a round's skippers while its
   results remained. Results reference skippers by position, so they became unreadable.

## Changes
1. race_series_rounds UPDATE policy now also allows the race_scorer club role.
2. scoring_checkpoints INSERT policy now also allows the race_scorer club role.
3. New BEFORE UPDATE trigger on race_series_rounds and quick_races keeps the existing
   skipper list when an update would empty it while race results are still present.

## Security
Only club members with admin, editor or race_scorer roles for the round's club can update.
*/

DROP POLICY IF EXISTS "Admins and race officers can update club series rounds" ON race_series_rounds;
CREATE POLICY "Admins and race officers can update club series rounds"
ON race_series_rounds FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM user_clubs
  WHERE user_clubs.club_id = race_series_rounds.club_id
  AND user_clubs.user_id = (SELECT auth.uid())
  AND user_clubs.role = ANY (ARRAY['admin'::club_role, 'editor'::club_role, 'race_scorer'::club_role])))
WITH CHECK (EXISTS (SELECT 1 FROM user_clubs
  WHERE user_clubs.club_id = race_series_rounds.club_id
  AND user_clubs.user_id = (SELECT auth.uid())
  AND user_clubs.role = ANY (ARRAY['admin'::club_role, 'editor'::club_role, 'race_scorer'::club_role])));

DROP POLICY IF EXISTS "Club admins can create scoring checkpoints" ON scoring_checkpoints;
CREATE POLICY "Club admins can create scoring checkpoints"
ON scoring_checkpoints FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM user_clubs
  WHERE user_clubs.club_id = scoring_checkpoints.club_id
  AND user_clubs.user_id = auth.uid()
  AND user_clubs.role = ANY (ARRAY['admin'::club_role, 'editor'::club_role, 'race_scorer'::club_role])));

CREATE OR REPLACE FUNCTION public.preserve_skippers_with_results()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.skippers IS NULL OR jsonb_typeof(NEW.skippers) <> 'array' OR jsonb_array_length(NEW.skippers) = 0)
     AND jsonb_typeof(OLD.skippers) = 'array' AND jsonb_array_length(OLD.skippers) > 0
     AND jsonb_typeof(NEW.race_results) = 'array' AND jsonb_array_length(NEW.race_results) > 0 THEN
    NEW.skippers := OLD.skippers;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_skippers_with_results_trigger ON public.race_series_rounds;
CREATE TRIGGER preserve_skippers_with_results_trigger
BEFORE UPDATE ON public.race_series_rounds
FOR EACH ROW EXECUTE FUNCTION public.preserve_skippers_with_results();

DROP TRIGGER IF EXISTS preserve_skippers_with_results_trigger ON public.quick_races;
CREATE TRIGGER preserve_skippers_with_results_trigger
BEFORE UPDATE ON public.quick_races
FOR EACH ROW EXECUTE FUNCTION public.preserve_skippers_with_results();