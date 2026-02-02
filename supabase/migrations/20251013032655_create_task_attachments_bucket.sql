/*
  # Create Task Attachments Storage Bucket

  1. New Storage Bucket
    - `task-attachments` - Stores files attached to tasks
  
  2. Security
    - Enable RLS on storage bucket
    - Add policies for uploading and viewing attachments
*/

-- Create storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can upload files to their club's folder
CREATE POLICY "Users can upload task attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments' AND
  auth.uid()::text = (string_to_array(name, '/'))[2]
);

-- Policy: Authenticated users can view task attachments
CREATE POLICY "Users can view task attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments');

-- Policy: Users can delete their own uploaded attachments
CREATE POLICY "Users can delete their task attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments' AND
  auth.uid()::text = (string_to_array(name, '/'))[2]
);
