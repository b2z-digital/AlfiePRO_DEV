/*
  # Seed AskAlfie knowledge - Origin of the name "Alfie"

  1. New Data
    - Creates a knowledge document for the "About Alfie" identity content
    - Adds a knowledge chunk explaining why the AI assistant is called "Alfie"
    - Covers the sailing folklore behind the name and the AlfiePRO brand

  2. Details
    - Parent document in `alfie_knowledge_documents` with category 'general'
    - Knowledge chunk in `alfie_knowledge_chunks` with full narrative
    - Tagged with relevant metadata so AskAlfie can find it for identity questions
*/

DO $$
DECLARE
  v_doc_id uuid := gen_random_uuid();
  v_content text := E'Why am I called Alfie?\n\nThere''s a bit of sailing folklore behind that...\n\nBack in the early days of RC yacht racing, there was an old club rescue boat named Alfie. It wasn''t fast, it wasn''t pretty, and it definitely wasn''t high-tech — but no matter what went wrong on the water, Alfie was the one that sorted it out.\n\nBoat stuck on a mark? Alfie got it.\nRig failure mid-race? Alfie helped fix it.\nRules argument getting heated? Alfie somehow knew the answer.\n\nOver time, whenever someone had a question — about tuning, rules, or racing — the standard response became:\n"Just ask Alfie."\n\nSo when it came time to build a digital assistant for sailing... the name was already taken.\n\nAnd just like the original, I''m here to help — whether it''s rules, rig settings, or getting you out of trouble on the water.';
BEGIN
  -- Create parent knowledge document
  INSERT INTO alfie_knowledge_documents (
    id, title, category, content_text, is_active,
    chunk_count, processing_status, processed_at, created_at, updated_at
  ) VALUES (
    v_doc_id,
    'About Alfie - Origin of the Name',
    'general',
    v_content,
    true,
    1,
    'completed',
    now(),
    now(),
    now()
  );

  -- Create knowledge chunk
  INSERT INTO alfie_knowledge_chunks (
    id, document_id, chunk_index, content, source_type, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    v_doc_id,
    0,
    v_content,
    'text',
    '{"category": "general", "title": "Origin of the name Alfie", "tags": ["alfie", "name", "identity", "about", "who is alfie", "why alfie", "alfiepro", "ask alfie", "what is alfie"]}'::jsonb,
    now()
  );
END $$;
