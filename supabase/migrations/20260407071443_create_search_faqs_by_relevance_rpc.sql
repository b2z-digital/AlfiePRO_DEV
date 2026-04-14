
/*
  # Create FAQ search function for AskAlfie

  1. New Functions
    - `search_faqs_by_relevance` - Searches published FAQs by keyword matching
      against question and answer text, returns results with category context
      ordered by relevance score

  2. Important Notes
    - Uses word-level matching for relevance scoring
    - Includes category name and parent category name for context
    - Returns up to a configurable number of matches
    - Falls back gracefully if no matches found
*/

CREATE OR REPLACE FUNCTION search_faqs_by_relevance(
  search_query text,
  match_count int DEFAULT 15
)
RETURNS TABLE (
  question text,
  answer text,
  category_name text,
  parent_category_name text,
  relevance_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_terms text[];
  term text;
BEGIN
  search_terms := string_to_array(lower(trim(search_query)), ' ');

  RETURN QUERY
  SELECT
    f.question,
    f.answer,
    COALESCE(c.name, 'General') AS category_name,
    pc.name AS parent_category_name,
    (
      (CASE WHEN lower(f.question) ILIKE '%' || lower(trim(search_query)) || '%' THEN 10.0 ELSE 0.0 END) +
      (CASE WHEN lower(f.answer) ILIKE '%' || lower(trim(search_query)) || '%' THEN 5.0 ELSE 0.0 END) +
      (
        SELECT COALESCE(SUM(
          CASE
            WHEN lower(f.question) ILIKE '%' || t || '%' THEN 3.0
            ELSE 0.0
          END +
          CASE
            WHEN lower(f.answer) ILIKE '%' || t || '%' THEN 1.5
            ELSE 0.0
          END +
          CASE
            WHEN lower(COALESCE(c.name, '')) ILIKE '%' || t || '%' THEN 2.0
            ELSE 0.0
          END
        ), 0.0)
        FROM unnest(search_terms) AS t
        WHERE length(t) > 2
      )
    ) AS relevance_score
  FROM support_faqs f
  LEFT JOIN support_faq_categories c ON f.category_id = c.id
  LEFT JOIN support_faq_categories pc ON c.parent_id = pc.id
  WHERE f.is_published = true
  AND (
    lower(f.question) ILIKE '%' || lower(trim(search_query)) || '%'
    OR lower(f.answer) ILIKE '%' || lower(trim(search_query)) || '%'
    OR lower(COALESCE(c.name, '')) ILIKE '%' || lower(trim(search_query)) || '%'
    OR lower(COALESCE(pc.name, '')) ILIKE '%' || lower(trim(search_query)) || '%'
    OR EXISTS (
      SELECT 1 FROM unnest(search_terms) AS t
      WHERE length(t) > 2
      AND (
        lower(f.question) ILIKE '%' || t || '%'
        OR lower(f.answer) ILIKE '%' || t || '%'
        OR lower(COALESCE(c.name, '')) ILIKE '%' || t || '%'
      )
    )
  )
  ORDER BY relevance_score DESC
  LIMIT match_count;
END;
$$;
