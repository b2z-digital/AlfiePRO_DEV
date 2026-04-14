/*
  # Process 4 Remaining Rig Tuning Guides into Knowledge Chunks

  1. Changes
    - Creates alfie_knowledge_documents records for each of the 4 new pending tuning guides
    - Splits content into knowledge chunks in alfie_knowledge_chunks table
    - Updates tuning guide status to completed with correct chunk counts

  2. Guides Processed
    - Sail Creases - Impact on Performance
    - Racing Mindset - Consistency and Perseverance
    - The Order to Follow When Setting Up Your Boat
    - Where to Stand in Relation to Your Boat During a Race

  3. Important Notes
    - Chunks follow the same structure as existing tuning guide chunks
    - source_type is set to tuning-guide for proper search filtering
    - Completes the full set of 8 training transcript tuning guides
*/

DO $$
DECLARE
  v_guide RECORD;
  v_doc_id uuid;
  v_chunk_count int;
  v_chunk_idx int;
  v_paragraphs text[];
  v_current_chunk text;
  v_para text;
BEGIN
  FOR v_guide IN
    SELECT id, name, boat_type, hull_type, content_text, description
    FROM alfie_tuning_guides
    WHERE status = 'pending' AND input_type = 'text'
      AND name IN (
        'Sail Creases - Impact on Performance',
        'Racing Mindset - Consistency and Perseverance',
        'The Order to Follow When Setting Up Your Boat',
        'Where to Stand in Relation to Your Boat During a Race'
      )
    ORDER BY name
  LOOP
    v_doc_id := gen_random_uuid();

    INSERT INTO alfie_knowledge_documents (
      id, title, category, content_text, is_active,
      processing_status, chunk_count, processed_at
    ) VALUES (
      v_doc_id,
      v_guide.name,
      'tuning-guide',
      v_guide.content_text,
      true,
      'completed',
      0,
      now()
    );

    v_paragraphs := string_to_array(v_guide.content_text, E'\n\n');
    v_chunk_idx := 0;
    v_current_chunk := '';
    v_chunk_count := 0;

    FOREACH v_para IN ARRAY v_paragraphs
    LOOP
      IF v_para IS NULL OR length(trim(v_para)) < 10 THEN
        CONTINUE;
      END IF;

      IF length(v_current_chunk) + length(v_para) + 2 > 1500 AND length(v_current_chunk) > 50 THEN
        INSERT INTO alfie_knowledge_chunks (
          id, document_id, tuning_guide_id, chunk_index, content,
          source_type, boat_type, hull_type,
          metadata, created_at
        ) VALUES (
          gen_random_uuid(),
          v_doc_id,
          v_guide.id,
          v_chunk_idx,
          trim(v_current_chunk),
          'tuning-guide',
          v_guide.boat_type,
          v_guide.hull_type,
          jsonb_build_object(
            'boat_type', v_guide.boat_type,
            'hull_type', v_guide.hull_type,
            'guide_name', v_guide.name,
            'source_type', 'tuning-guide',
            'chunk_index', v_chunk_idx,
            'document_title', v_guide.name,
            'tuning_guide_id', v_guide.id::text
          ),
          now()
        );
        v_chunk_idx := v_chunk_idx + 1;
        v_chunk_count := v_chunk_count + 1;
        v_current_chunk := v_para;
      ELSE
        IF length(v_current_chunk) > 0 THEN
          v_current_chunk := v_current_chunk || E'\n\n' || v_para;
        ELSE
          v_current_chunk := v_para;
        END IF;
      END IF;
    END LOOP;

    IF length(trim(v_current_chunk)) > 50 THEN
      INSERT INTO alfie_knowledge_chunks (
        id, document_id, tuning_guide_id, chunk_index, content,
        source_type, boat_type, hull_type,
        metadata, created_at
      ) VALUES (
        gen_random_uuid(),
        v_doc_id,
        v_guide.id,
        v_chunk_idx,
        trim(v_current_chunk),
        'tuning-guide',
        v_guide.boat_type,
        v_guide.hull_type,
        jsonb_build_object(
          'boat_type', v_guide.boat_type,
          'hull_type', v_guide.hull_type,
          'guide_name', v_guide.name,
          'source_type', 'tuning-guide',
          'chunk_index', v_chunk_idx,
          'document_title', v_guide.name,
          'tuning_guide_id', v_guide.id::text
        ),
        now()
      );
      v_chunk_count := v_chunk_count + 1;
    END IF;

    UPDATE alfie_knowledge_documents
    SET chunk_count = v_chunk_count
    WHERE id = v_doc_id;

    UPDATE alfie_tuning_guides
    SET status = 'completed',
        chunk_count = v_chunk_count,
        processed_at = now()
    WHERE id = v_guide.id;

  END LOOP;
END $$;
