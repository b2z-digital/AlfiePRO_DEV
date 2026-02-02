/*
  # Fix AlfieTV Content Type Constraint

  1. Issue
    - Auto-tagging function sets content_type to 'tutorial' and 'regatta' 
    - But constraint only allows: racing, tuning, building, techniques, reviews, general
    
  2. Solution
    - Update auto-tagging function to use valid content types
    - OR expand constraint to include additional types
    
  3. Approach
    - Fix the auto-tagging function to map to valid types
*/

-- Update auto-tagging function to use valid content types
CREATE OR REPLACE FUNCTION auto_tag_video()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  detected_words text[] := '{}';
  detected_yr integer := NULL;
  search_text text;
BEGIN
  search_text := LOWER(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, ''));

  -- Detect major events
  IF search_text ~* 'hobart|rolex|sailgp|americas cup|world championship|regatta' THEN
    detected_words := array_append(detected_words, 'major_event');
  END IF;

  -- Detect boat classes
  IF search_text ~* '10r|10 rater|ten rater' THEN
    detected_words := array_append(detected_words, '10r');
  END IF;

  -- Detect racing content
  IF search_text ~* 'fleet racing|match racing|race|racing' THEN
    detected_words := array_append(detected_words, 'racing');
  END IF;

  -- Detect educational content
  IF search_text ~* 'tutorial|how to|guide|tips|technique' THEN
    detected_words := array_append(detected_words, 'educational');
  END IF;

  -- Detect live content
  IF search_text ~* 'live|streaming' THEN
    detected_words := array_append(detected_words, 'live');
    NEW.is_live := true;
  END IF;

  -- Detect highlights
  IF search_text ~* 'highlight|recap|review' THEN
    detected_words := array_append(detected_words, 'highlights');
  END IF;

  -- Detect tuning content
  IF search_text ~* 'tuning|setup|rig|sail trim' THEN
    detected_words := array_append(detected_words, 'tuning');
  END IF;

  -- Detect building content
  IF search_text ~* 'building|construction|build|making' THEN
    detected_words := array_append(detected_words, 'building');
  END IF;

  -- Extract year
  FOR detected_yr IN 2020..2030 LOOP
    IF search_text ~ detected_yr::text THEN
      NEW.detected_year := detected_yr;
      EXIT;
    END IF;
  END LOOP;

  NEW.detected_keywords := detected_words;

  -- Map detected keywords to valid content_type values
  IF 'educational' = ANY(detected_words) THEN
    NEW.content_type := 'techniques';
  ELSIF 'tuning' = ANY(detected_words) THEN
    NEW.content_type := 'tuning';
  ELSIF 'building' = ANY(detected_words) THEN
    NEW.content_type := 'building';
  ELSIF 'racing' = ANY(detected_words) THEN
    NEW.content_type := 'racing';
  ELSIF 'highlights' = ANY(detected_words) THEN
    NEW.content_type := 'reviews';
  ELSE
    -- Default to general if no specific category matches
    NEW.content_type := 'general';
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_auto_tag_video ON alfie_tv_videos;
CREATE TRIGGER trigger_auto_tag_video
  BEFORE INSERT OR UPDATE OF title, description
  ON alfie_tv_videos
  FOR EACH ROW
  EXECUTE FUNCTION auto_tag_video();
