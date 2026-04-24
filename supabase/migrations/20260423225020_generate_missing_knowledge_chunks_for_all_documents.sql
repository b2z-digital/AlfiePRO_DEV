/*
  # Generate Missing Knowledge Chunks for Documents with Content

  1. Problem
    - 35 RO Training documents and 1 tuning-guide document have content_text but zero knowledge chunks
    - Ask Alfie's search function only searches knowledge chunks, so these documents are invisible to the AI
    - All documents show processing_status = 'completed' but chunks were never created

  2. Fix
    - Insert one knowledge chunk per document using the document's content_text
    - Set metadata with document_title and category for improved search relevance
    - Update chunk_count on each document

  3. Affected Documents
    - 5 course-setting documents
    - 3 event-management documents
    - 1 finishing-procedures document
    - 5 protest-committee documents
    - 10 race-management documents
    - 8 scoring-systems documents
    - 3 starting-procedures documents
    - 1 tuning-guide document (Trance 10R)
    - Total: 36 documents getting chunks
*/

INSERT INTO alfie_knowledge_chunks (id, document_id, content, metadata)
SELECT 
  gen_random_uuid(),
  akd.id,
  akd.content_text,
  jsonb_build_object(
    'document_title', akd.title,
    'category', akd.category,
    'source_type', CASE 
      WHEN akd.category = 'tuning-guide' THEN 'tuning-guide'
      WHEN akd.category IN ('sailing-rules', 'class-rules', 'racing-rules', 'scoring-rules') THEN 'sailing-rules'
      ELSE 'ro-training'
    END,
    'chunk_index', 0,
    'auto_generated', true
  )
FROM alfie_knowledge_documents akd
WHERE akd.is_active = true
  AND akd.content_text IS NOT NULL
  AND LENGTH(akd.content_text) > 0
  AND akd.id NOT IN (
    SELECT DISTINCT document_id 
    FROM alfie_knowledge_chunks 
    WHERE document_id IS NOT NULL
  );

-- Update chunk_count on the documents
UPDATE alfie_knowledge_documents akd
SET chunk_count = (
  SELECT COUNT(*) FROM alfie_knowledge_chunks akc WHERE akc.document_id = akd.id
)
WHERE akd.is_active = true
  AND akd.content_text IS NOT NULL
  AND LENGTH(akd.content_text) > 0
  AND (akd.chunk_count IS NULL OR akd.chunk_count = 0);
