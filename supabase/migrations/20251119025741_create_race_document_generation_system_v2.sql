/*
  # Create Race Document Generation System

  1. New Tables
    - `document_templates`
      - Stores document templates (NOR, SI, etc.) with sections and styling
      - Links to club_id for ownership
      - Contains JSONB sections array with template content
    
    - `form_submissions`
      - Stores data collected from forms when generating documents
      - Links to form_id, event_id (optional), and user
      - Contains JSONB form_data with all submitted values
    
    - `generated_documents`
      - Stores generated PDF documents
      - Links to template, form_submission, and optionally event
      - Stores PDF URL in storage
      - Tracks document type (nor, si, amendment, etc.)
  
  2. Security
    - Enable RLS on all tables
    - Club members can view their club's templates and documents
    - Club admins/editors can create/update templates
    - Authenticated users can submit forms
    - Members can view documents for their events
  
  3. Storage
    - Create storage bucket for generated documents
    - Set up appropriate storage policies
*/

-- Create document_templates table if not exists
CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  document_type text CHECK (document_type IN ('nor', 'si', 'amendment', 'notice', 'other')) DEFAULT 'nor',
  logo_url text,
  sections jsonb DEFAULT '[]'::jsonb,
  linked_form_id uuid REFERENCES race_forms(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Create form_submissions table
CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES race_forms(id) ON DELETE CASCADE,
  event_id uuid REFERENCES quick_races(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create generated_documents table
CREATE TABLE IF NOT EXISTS generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  form_submission_id uuid REFERENCES form_submissions(id) ON DELETE CASCADE,
  event_id uuid REFERENCES quick_races(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  document_type text CHECK (document_type IN ('nor', 'si', 'amendment', 'notice', 'other')) DEFAULT 'nor',
  title text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Enable RLS
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_templates
CREATE POLICY "Users can view templates for their club"
  ON document_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can create templates"
  ON document_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can update templates"
  ON document_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can delete templates"
  ON document_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = document_templates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for form_submissions
CREATE POLICY "Users can view form submissions for their events"
  ON form_submissions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = submitted_by OR
    EXISTS (
      SELECT 1 FROM quick_races qr
      JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = form_submissions.event_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create form submissions"
  ON form_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Submitter can update their submissions"
  ON form_submissions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = submitted_by)
  WITH CHECK (auth.uid() = submitted_by);

-- RLS Policies for generated_documents
CREATE POLICY "Users can view documents for their club"
  ON generated_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = generated_documents.club_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create documents"
  ON generated_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = generated_by AND
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = generated_documents.club_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Document creator can update their documents"
  ON generated_documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = generated_by)
  WITH CHECK (auth.uid() = generated_by);

CREATE POLICY "Club admins can delete documents"
  ON generated_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = generated_documents.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_club_id ON document_templates(club_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_active ON document_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_event_id ON form_submissions(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_by ON form_submissions(submitted_by) WHERE submitted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generated_documents_event_id ON generated_documents(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generated_documents_template_id ON generated_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_club_id ON generated_documents(club_id);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_form_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_generated_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_document_templates_updated_at ON document_templates;
CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_document_templates_updated_at();

DROP TRIGGER IF EXISTS update_form_submissions_updated_at ON form_submissions;
CREATE TRIGGER update_form_submissions_updated_at
  BEFORE UPDATE ON form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_form_submissions_updated_at();

DROP TRIGGER IF EXISTS update_generated_documents_updated_at ON generated_documents;
CREATE TRIGGER update_generated_documents_updated_at
  BEFORE UPDATE ON generated_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_generated_documents_updated_at();

-- Create storage bucket for generated documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('race-documents', 'race-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for race-documents bucket
CREATE POLICY "Users can upload documents for their club"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'race-documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view race documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'race-documents');

CREATE POLICY "Users can update their uploaded documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'race-documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their uploaded documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'race-documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
  );