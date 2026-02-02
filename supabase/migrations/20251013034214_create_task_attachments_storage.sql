/*
  # Create Task Attachments Storage Bucket

  1. New Storage Bucket
    - `task-attachments` - Stores files attached to tasks
  
  2. Security
    - Enable RLS policies for authenticated users
    - Public read access for all users
*/

-- Create storage bucket for task attachments if it doesn't exist
INSERT INTO storage.buckets (id, name)
SELECT 'task-attachments', 'task-attachments'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'task-attachments'
);

-- Enable read access for all users
CREATE POLICY "Enable read access for all users" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'task-attachments');

-- Enable insert for authenticated users
CREATE POLICY "Enable insert for authenticated users" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-attachments');

-- Enable update for authenticated users
CREATE POLICY "Enable update for authenticated users" ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'task-attachments');

-- Enable delete for authenticated users
CREATE POLICY "Enable delete for authenticated users" ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'task-attachments');
