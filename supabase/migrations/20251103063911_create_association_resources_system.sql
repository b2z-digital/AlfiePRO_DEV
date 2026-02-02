/*
  # Association Resources Management System

  1. New Tables
    - `association_resource_categories`
      - `id` (uuid, primary key)
      - `association_id` (uuid, references state or national associations)
      - `association_type` (text, 'state' or 'national')
      - `name` (text, category name like "Information Pages", "Audio Files")
      - `description` (text)
      - `icon` (text, lucide icon name)
      - `display_order` (integer)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `association_resources`
      - `id` (uuid, primary key)
      - `category_id` (uuid, references association_resource_categories)
      - `title` (text, resource title)
      - `description` (text)
      - `resource_type` (text: 'page', 'file', 'link', 'external_tool')
      - `content` (jsonb, for page content or structured data)
      - `file_url` (text, for file downloads)
      - `file_type` (text, mime type)
      - `file_size` (bigint, in bytes)
      - `external_url` (text, for links and external tools)
      - `thumbnail_url` (text)
      - `is_featured` (boolean)
      - `is_public` (boolean, visible to clubs/members)
      - `view_count` (integer)
      - `download_count` (integer)
      - `tags` (text[])
      - `display_order` (integer)
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Association admins can manage their resources
    - Public resources are viewable by anyone
    - Private resources only by association admins

  3. Storage
    - Create storage bucket for association resource files
*/

-- Create association_resource_categories table
CREATE TABLE IF NOT EXISTS association_resource_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  name text NOT NULL,
  description text,
  icon text DEFAULT 'folder',
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create association_resources table
CREATE TABLE IF NOT EXISTS association_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES association_resource_categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  resource_type text NOT NULL CHECK (resource_type IN ('page', 'file', 'link', 'external_tool')),
  content jsonb,
  file_url text,
  file_type text,
  file_size bigint,
  external_url text,
  thumbnail_url text,
  is_featured boolean DEFAULT false,
  is_public boolean DEFAULT true,
  view_count integer DEFAULT 0,
  download_count integer DEFAULT 0,
  tags text[] DEFAULT ARRAY[]::text[],
  display_order integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_resource_categories_association ON association_resource_categories(association_id, association_type);
CREATE INDEX IF NOT EXISTS idx_resources_category ON association_resources(category_id);
CREATE INDEX IF NOT EXISTS idx_resources_type ON association_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resources_public ON association_resources(is_public);
CREATE INDEX IF NOT EXISTS idx_resources_featured ON association_resources(is_featured);

-- Enable RLS
ALTER TABLE association_resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE association_resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for association_resource_categories
CREATE POLICY "Association admins can view their categories"
  ON association_resource_categories FOR SELECT
  TO authenticated
  USING (
    CASE 
      WHEN association_type = 'state' THEN
        EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = association_resource_categories.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        )
      WHEN association_type = 'national' THEN
        EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = association_resource_categories.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        )
      ELSE false
    END
  );

CREATE POLICY "Association admins can create categories"
  ON association_resource_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE 
      WHEN association_type = 'state' THEN
        EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = association_resource_categories.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        )
      WHEN association_type = 'national' THEN
        EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = association_resource_categories.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        )
      ELSE false
    END
  );

CREATE POLICY "Association admins can update their categories"
  ON association_resource_categories FOR UPDATE
  TO authenticated
  USING (
    CASE 
      WHEN association_type = 'state' THEN
        EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = association_resource_categories.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        )
      WHEN association_type = 'national' THEN
        EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = association_resource_categories.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        )
      ELSE false
    END
  )
  WITH CHECK (
    CASE 
      WHEN association_type = 'state' THEN
        EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = association_resource_categories.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        )
      WHEN association_type = 'national' THEN
        EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = association_resource_categories.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        )
      ELSE false
    END
  );

CREATE POLICY "Association admins can delete their categories"
  ON association_resource_categories FOR DELETE
  TO authenticated
  USING (
    CASE 
      WHEN association_type = 'state' THEN
        EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = association_resource_categories.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        )
      WHEN association_type = 'national' THEN
        EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = association_resource_categories.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        )
      ELSE false
    END
  );

-- RLS Policies for association_resources
CREATE POLICY "Anyone can view public resources"
  ON association_resources FOR SELECT
  USING (is_public = true);

CREATE POLICY "Association admins can view all their resources"
  ON association_resources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_resource_categories arc
      WHERE arc.id = association_resources.category_id
      AND (
        (arc.association_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = arc.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (arc.association_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = arc.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

CREATE POLICY "Association admins can create resources"
  ON association_resources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM association_resource_categories arc
      WHERE arc.id = association_resources.category_id
      AND (
        (arc.association_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = arc.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (arc.association_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = arc.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

CREATE POLICY "Association admins can update their resources"
  ON association_resources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_resource_categories arc
      WHERE arc.id = association_resources.category_id
      AND (
        (arc.association_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = arc.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (arc.association_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = arc.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM association_resource_categories arc
      WHERE arc.id = association_resources.category_id
      AND (
        (arc.association_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = arc.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (arc.association_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = arc.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

CREATE POLICY "Association admins can delete their resources"
  ON association_resources FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_resource_categories arc
      WHERE arc.id = association_resources.category_id
      AND (
        (arc.association_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = arc.association_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (arc.association_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations
          WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = arc.association_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

-- Create storage bucket for association resources
INSERT INTO storage.buckets (id, name, public)
VALUES ('association-resources', 'association-resources', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Association admins can upload resource files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'association-resources'
  );

CREATE POLICY "Anyone can view resource files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'association-resources');

CREATE POLICY "Association admins can update resource files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'association-resources')
  WITH CHECK (bucket_id = 'association-resources');

CREATE POLICY "Association admins can delete resource files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'association-resources');

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_resource_view_count(resource_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE association_resources
  SET view_count = view_count + 1
  WHERE id = resource_id;
END;
$$;

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_resource_download_count(resource_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE association_resources
  SET download_count = download_count + 1
  WHERE id = resource_id;
END;
$$;