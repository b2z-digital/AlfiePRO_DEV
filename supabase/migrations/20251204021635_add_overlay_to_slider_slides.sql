/*
  # Add Overlay Settings to Slider Slides

  1. Changes
    - Add `overlay_type` column ('none', 'solid', 'gradient')
    - Add `overlay_color` column for solid color overlays
    - Add `overlay_gradient_start` column for gradient overlays
    - Add `overlay_gradient_end` column for gradient overlays
    - Add `overlay_gradient_direction` column ('to-bottom', 'to-right', 'to-top', 'to-left')
    - Add `overlay_opacity` column (0-100)

  2. Notes
    - Backward compatible - defaults to 'none' for existing slides
    - Opacity is a percentage (0-100) for easier UI control
    - Gradient direction uses CSS-compatible values
*/

-- Add overlay_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'overlay_type'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN overlay_type text DEFAULT 'none';
  END IF;
END $$;

-- Add overlay_color column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'overlay_color'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN overlay_color text DEFAULT '#000000';
  END IF;
END $$;

-- Add overlay_gradient_start column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'overlay_gradient_start'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN overlay_gradient_start text DEFAULT '#000000';
  END IF;
END $$;

-- Add overlay_gradient_end column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'overlay_gradient_end'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN overlay_gradient_end text DEFAULT '#ffffff';
  END IF;
END $$;

-- Add overlay_gradient_direction column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'overlay_gradient_direction'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN overlay_gradient_direction text DEFAULT 'to-bottom';
  END IF;
END $$;

-- Add overlay_opacity column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_slider_slides'
    AND column_name = 'overlay_opacity'
  ) THEN
    ALTER TABLE public.event_slider_slides ADD COLUMN overlay_opacity integer DEFAULT 30;
  END IF;
END $$;
