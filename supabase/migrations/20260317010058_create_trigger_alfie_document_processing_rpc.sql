/*
  # Create RPC to trigger Alfie document processing via pg_net

  1. New Functions
    - `trigger_alfie_document_processing(p_guide_id uuid, p_document_id uuid)` - Server-side RPC that calls the process-alfie-document edge function using pg_net, bypassing browser fetch restrictions
  
  2. Purpose
    - Allows the frontend to trigger edge function processing through a database RPC call
    - Uses pg_net to make the HTTP request server-side
    - Returns immediately while processing happens asynchronously
  
  3. Security
    - Only authenticated users can call this function
*/

CREATE OR REPLACE FUNCTION public.trigger_alfie_document_processing(
  p_guide_id uuid DEFAULT NULL,
  p_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_request_id bigint;
  v_body jsonb;
BEGIN
  IF p_guide_id IS NULL AND p_document_id IS NULL THEN
    RETURN jsonb_build_object('error', 'guide_id or document_id is required');
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
  END IF;

  v_service_key := current_setting('app.settings.service_role_key', true);
  IF v_service_key IS NULL OR v_service_key = '' THEN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  END IF;

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    IF p_guide_id IS NOT NULL THEN
      UPDATE alfie_tuning_guides 
      SET status = 'failed', 
          processing_error = 'Server configuration missing - contact administrator',
          updated_at = now()
      WHERE id = p_guide_id;
    END IF;
    IF p_document_id IS NOT NULL THEN
      UPDATE alfie_knowledge_documents 
      SET processing_status = 'failed',
          processing_error = 'Server configuration missing - contact administrator',
          updated_at = now()
      WHERE id = p_document_id;
    END IF;
    RETURN jsonb_build_object('error', 'Server configuration not available');
  END IF;

  IF p_guide_id IS NOT NULL THEN
    v_body := jsonb_build_object('guideId', p_guide_id);
    UPDATE alfie_tuning_guides SET status = 'processing', updated_at = now() WHERE id = p_guide_id;
  ELSE
    v_body := jsonb_build_object('documentId', p_document_id);
    UPDATE alfie_knowledge_documents SET processing_status = 'processing', updated_at = now() WHERE id = p_document_id;
  END IF;

  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/process-alfie-document',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'apikey', v_service_key
    ),
    body := v_body
  ) INTO v_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);

EXCEPTION WHEN OTHERS THEN
  IF p_guide_id IS NOT NULL THEN
    UPDATE alfie_tuning_guides 
    SET status = 'failed', 
        processing_error = 'Failed to trigger processing: ' || SQLERRM,
        updated_at = now()
    WHERE id = p_guide_id;
  END IF;
  IF p_document_id IS NOT NULL THEN
    UPDATE alfie_knowledge_documents 
    SET processing_status = 'failed',
        processing_error = 'Failed to trigger processing: ' || SQLERRM,
        updated_at = now()
    WHERE id = p_document_id;
  END IF;
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;