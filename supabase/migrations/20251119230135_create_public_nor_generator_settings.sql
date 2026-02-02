/*
  # Create Public NOR Generator Settings
  
  1. New Tables
    - `public_nor_generator_settings`
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs) - Which club owns this generator
      - `is_enabled` (boolean) - Whether the public generator is active
      - `slug` (text, unique) - URL slug for the generator (e.g., 'myclub-nor')
      - `custom_domain` (text, nullable) - Optional custom domain
      - `default_template_id` (uuid, nullable) - Default NOR template to use
      - `allow_template_selection` (boolean) - Let users choose from available templates
      - `branding_logo_url` (text, nullable) - Club logo for generator page
      - `branding_primary_color` (text) - Primary brand color
      - `welcome_message` (text, nullable) - Custom welcome message
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `public_nor_generator_settings` table
    - Club admins can manage their settings
    - Public users can read enabled generators (via slug lookup)
  
  3. Indexes
    - Index on `slug` for fast public lookups
    - Index on `club_id` for admin access
*/

-- Create public_nor_generator_settings table
CREATE TABLE IF NOT EXISTS public_nor_generator_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  slug text UNIQUE NOT NULL,
  custom_domain text,
  default_template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL,
  allow_template_selection boolean DEFAULT true NOT NULL,
  branding_logo_url text,
  branding_primary_color text DEFAULT '#3B82F6',
  welcome_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) >= 3 AND length(slug) <= 50)
);

-- Enable RLS
ALTER TABLE public_nor_generator_settings ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_public_nor_settings_slug ON public_nor_generator_settings(slug);
CREATE INDEX IF NOT EXISTS idx_public_nor_settings_club_id ON public_nor_generator_settings(club_id);
CREATE INDEX IF NOT EXISTS idx_public_nor_settings_enabled ON public_nor_generator_settings(is_enabled) WHERE is_enabled = true;

-- Club admins can view their settings
CREATE POLICY "Club admins can view their NOR generator settings"
  ON public_nor_generator_settings FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc 
      WHERE uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );

-- Club admins can insert their settings
CREATE POLICY "Club admins can create NOR generator settings"
  ON public_nor_generator_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc 
      WHERE uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );

-- Club admins can update their settings
CREATE POLICY "Club admins can update NOR generator settings"
  ON public_nor_generator_settings FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc 
      WHERE uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc 
      WHERE uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );

-- Club admins can delete their settings
CREATE POLICY "Club admins can delete NOR generator settings"
  ON public_nor_generator_settings FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc 
      WHERE uc.user_id = auth.uid() 
      AND uc.role = 'admin'
    )
  );

-- Public users can view enabled generators (for the public page)
CREATE POLICY "Anyone can view enabled NOR generators by slug"
  ON public_nor_generator_settings FOR SELECT
  TO anon, authenticated
  USING (is_enabled = true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_public_nor_generator_settings_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_public_nor_generator_settings_timestamp ON public_nor_generator_settings;
CREATE TRIGGER update_public_nor_generator_settings_timestamp
  BEFORE UPDATE ON public_nor_generator_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_public_nor_generator_settings_updated_at();