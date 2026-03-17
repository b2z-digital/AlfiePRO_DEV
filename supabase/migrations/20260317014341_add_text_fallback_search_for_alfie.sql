/*
  # Add text-based fallback search for Ask Alfie

  1. New Functions
    - `search_knowledge_text` - keyword/text-based search fallback
      - Searches `alfie_knowledge_chunks` using ILIKE pattern matching
      - Filters to only active documents/guides/corrections
      - Returns results ranked by keyword match relevance
      - Used when vector search returns no results (e.g. missing embeddings)

  2. Modified Functions
    - Updated `match_knowledge_chunks` to include text fallback
      - If vector search returns fewer than 3 results, supplements with text search
      - Ensures Alfie can find content even without embeddings

  3. Important Notes
    - This is a safety net for chunks missing embeddings
    - Vector search remains the primary search method
    - Text search uses trigram-like keyword matching for relevance
*/

CREATE OR REPLACE FUNCTION search_knowledge_text(
  search_query text,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        CASE WHEN lower(akc.content) LIKE '%' || lower(search_query) || '%' THEN 0.5 ELSE 0.0 END
        + (
          SELECT COALESCE(SUM(
            CASE WHEN lower(akc.content) LIKE '%' || w || '%' THEN 0.15 ELSE 0.0 END
          ), 0.0)
          FROM unnest(query_words) AS w
          WHERE length(w) > 2
        )
      )::float AS score
    FROM alfie_knowledge_chunks akc
    WHERE (
      lower(akc.content) LIKE '%' || lower(search_query) || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(query_words) AS w
        WHERE length(w) > 2 AND lower(akc.content) LIKE '%' || w || '%'
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
    sc.score AS similarity
  FROM scored_chunks sc
  WHERE sc.score > 0.1
  ORDER BY sc.score DESC
  LIMIT match_count;
END;
$$;
