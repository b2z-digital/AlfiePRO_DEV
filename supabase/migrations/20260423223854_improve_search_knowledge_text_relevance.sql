/*
  # Improve search_knowledge_text Relevance Scoring

  1. Changes
    - Enhanced scoring algorithm to boost document title and metadata matches
    - Added bonus scoring when document title contains search terms (+0.3 per word)
    - Added bonus for exact phrase match in document title (+0.5)
    - Added bonus scoring when metadata category matches topic keywords (+0.2 per word)
    - Increased default match_count from 5 to 15
    - Now returns source_name (document title) for display in prompts
    - Better differentiation between highly relevant vs loosely matched chunks

  2. Impact
    - SHRS-specific questions will now properly surface SHRS knowledge chunks above tuning guides
    - Document title matches boost relevance significantly
    - Reduces noise from unrelated chunks that happen to contain common words
*/

DROP FUNCTION IF EXISTS public.search_knowledge_text(text, integer);

CREATE OR REPLACE FUNCTION public.search_knowledge_text(search_query text, match_count integer DEFAULT 15)
RETURNS TABLE(id uuid, document_id uuid, content text, metadata jsonb, similarity double precision, source_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  query_words text[];
  word text;
BEGIN
  query_words := string_to_array(lower(trim(search_query)), ' ');

  RETURN QUERY
  WITH scored_chunks AS (
    SELECT
      akc.id,
      akc.document_id,
      akc.content,
      akc.metadata,
      (
        -- Exact phrase match in content
        CASE WHEN lower(akc.content) LIKE '%' || lower(search_query) || '%' THEN 0.5 ELSE 0.0 END
        -- Individual word matches in content
        + (
          SELECT COALESCE(SUM(
            CASE WHEN lower(akc.content) LIKE '%' || w || '%' THEN 0.15 ELSE 0.0 END
          ), 0.0)
          FROM unnest(query_words) AS w
          WHERE length(w) > 2
        )
        -- Document title match bonus: boost chunks whose document title contains query terms
        + (
          SELECT COALESCE(SUM(
            CASE WHEN lower(COALESCE(akc.metadata->>'document_title', '')) LIKE '%' || w || '%' THEN 0.3 ELSE 0.0 END
          ), 0.0)
          FROM unnest(query_words) AS w
          WHERE length(w) > 2
        )
        -- Exact phrase match in document title (strong signal)
        + CASE WHEN lower(COALESCE(akc.metadata->>'document_title', '')) LIKE '%' || lower(search_query) || '%' THEN 0.5 ELSE 0.0 END
        -- Category match bonus: boost when metadata category relates to query topic
        + (
          SELECT COALESCE(SUM(
            CASE WHEN lower(COALESCE(akc.metadata->>'category', '')) LIKE '%' || w || '%' THEN 0.2 ELSE 0.0 END
          ), 0.0)
          FROM unnest(query_words) AS w
          WHERE length(w) > 2
        )
      )::float AS score,
      COALESCE(akc.metadata->>'document_title', 'Knowledge Document') AS source_title
    FROM alfie_knowledge_chunks akc
    WHERE (
      lower(akc.content) LIKE '%' || lower(search_query) || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(query_words) AS w
        WHERE length(w) > 2 AND lower(akc.content) LIKE '%' || w || '%'
      )
      OR EXISTS (
        SELECT 1 FROM unnest(query_words) AS w
        WHERE length(w) > 2 AND lower(COALESCE(akc.metadata->>'document_title', '')) LIKE '%' || w || '%'
      )
    )
    AND (
      EXISTS (
        SELECT 1 FROM alfie_knowledge_documents akd
        WHERE akd.id = akc.document_id AND akd.is_active = true
      )
      OR (
        akc.tuning_guide_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM alfie_tuning_guides atg
          WHERE atg.id = akc.tuning_guide_id AND atg.is_active = true
        )
      )
      OR (
        akc.correction_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM alfie_knowledge_corrections akco
          WHERE akco.id = akc.correction_id AND akco.status = 'active'
        )
      )
    )
  )
  SELECT
    sc.id,
    sc.document_id,
    sc.content,
    sc.metadata,
    sc.score AS similarity,
    sc.source_title AS source_name
  FROM scored_chunks sc
  WHERE sc.score > 0.1
  ORDER BY sc.score DESC
  LIMIT match_count;
END;
$function$;
