/*
  # Marketing Email Storage Bucket
  
  Creates storage bucket for marketing email templates, images, and assets.
  
  ## Bucket
  - marketing-assets - Store template thumbnails, email images, etc.
  
  ## Security
  - Admins can upload/manage files
  - Public read access for template thumbnails
*/

-- Create marketing assets bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-assets', 'marketing-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated admins to upload
CREATE POLICY "Admins can upload marketing assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-assets' AND
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Allow authenticated admins to update
CREATE POLICY "Admins can update marketing assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'marketing-assets' AND
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Allow authenticated admins to delete
CREATE POLICY "Admins can delete marketing assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'marketing-assets' AND
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Allow public read access
CREATE POLICY "Public can view marketing assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'marketing-assets');
