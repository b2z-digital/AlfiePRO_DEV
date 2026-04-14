
/*
  # Fix search_faqs_by_relevance return type

  1. Changes
    - Cast relevance_score to float8 to match function signature
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
  relevance_score float8
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_terms text[];
BEGIN
  search_terms := string_to_array(lower(trim(search_query)), ' ');

  RETURN QUERY
  SELECT
    f.question,
    f.answer,
    COALESCE(c.name, 'General')::text AS category_name,
    pc.name::text AS parent_category_name,
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
    )::float8 AS relevance_score
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
