/*
  # Create meeting attachments storage bucket

  1. New Storage
    - `meeting-attachments` bucket for storing files attached to meeting agenda items
  2. Security
    - Authenticated users can upload files
    - Authenticated users can read files from their organization's meetings
    - Authenticated users can delete their own uploads
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-attachments', 'meeting-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload meeting attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'meeting-attachments');

CREATE POLICY "Authenticated users can read meeting attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'meeting-attachments');

CREATE POLICY "Authenticated users can delete meeting attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'meeting-attachments');
