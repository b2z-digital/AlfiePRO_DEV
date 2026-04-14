/*
  # Add file attachment support to notifications

  1. Changes
    - Add `attachments` JSONB column to `notifications` table
      - Stores array of { name, url, size, type } objects
    - Create `message-attachments` storage bucket for uploaded files
    - Add storage policies for authenticated users

  2. Security
    - Authenticated users can upload to message-attachments bucket
    - All authenticated users can read from message-attachments (needed to download attachments)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'attachments'
  ) THEN
    ALTER TABLE notifications ADD COLUMN attachments jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload message attachments'
  ) THEN
    CREATE POLICY "Authenticated users can upload message attachments"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'message-attachments');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Anyone can read message attachments'
  ) THEN
    CREATE POLICY "Anyone can read message attachments"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'message-attachments');
  END IF;
END $$;
