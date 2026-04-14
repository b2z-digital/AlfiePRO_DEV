/*
  # Add update policy for meeting attachments storage

  1. Security
    - Add UPDATE policy for authenticated users on meeting-attachments bucket
    - Required for Supabase storage upload operations which may use upsert
*/

CREATE POLICY "Authenticated users can update meeting attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'meeting-attachments')
  WITH CHECK (bucket_id = 'meeting-attachments');
