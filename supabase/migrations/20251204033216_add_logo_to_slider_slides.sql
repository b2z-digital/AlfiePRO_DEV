/*
  # Add Logo Support to Slider Slides

  1. Changes
    - Add `logo_url` column for event/brand logos
    - Add `logo_size` column (percentage-based, default 100)

  2. Notes
    - Logo appears above title and subtitle
    - Size is percentage-based for responsive scaling
    - Backward compatible - logo is optional
*/

-- Add logo_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN logo_url text;
  END IF;
END $$;

-- Add logo_size column (percentage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'logo_size'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN logo_size integer DEFAULT 100;
  END IF;
END $$;
