/*
  # Create Event Documents Storage Bucket

  1. Storage
    - Creates 'event-documents' storage bucket for PDFs and documents
    - Enables public access for read operations
    - Restricts upload to authenticated users with event website access
  
  2. Security
    - Authenticated users can upload to their event website folders
    - Public can download/view documents
    - Implements proper RLS policies for security
*/

-- Create the event-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-documents', 'event-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload documents to their event website folder
CREATE POLICY "Authenticated users can upload event documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM event_websites
    WHERE id IN (
      SELECT event_website_id FROM event_website_events
      WHERE event_id IN (
        SELECT event_id FROM user_clubs WHERE user_id = auth.uid()
      )
    )
  )
);

-- Allow authenticated users to update their event documents
CREATE POLICY "Authenticated users can update event documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM event_websites
    WHERE id IN (
      SELECT event_website_id FROM event_website_events
      WHERE event_id IN (
        SELECT event_id FROM user_clubs WHERE user_id = auth.uid()
      )
    )
  )
);

-- Allow authenticated users to delete their event documents
CREATE POLICY "Authenticated users can delete event documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM event_websites
    WHERE id IN (
      SELECT event_website_id FROM event_website_events
      WHERE event_id IN (
        SELECT event_id FROM user_clubs WHERE user_id = auth.uid()
      )
    )
  )
);

-- Allow public read access to all event documents
CREATE POLICY "Public can view event documents"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'event-documents');