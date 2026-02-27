/*
  # Add is_default flag to integrations table

  1. Modified Tables
    - `integrations`
      - Added `is_default` (boolean, default false) - marks a system-wide default integration
  
  2. Data Updates
    - Marks the existing AlfiePRO YouTube integration as the system default

  3. Notes
    - The default YouTube integration is used by all clubs that haven't connected their own YouTube account
    - Only one default per platform should exist
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'integrations'
    AND column_name = 'is_default'
  ) THEN
    ALTER TABLE public.integrations ADD COLUMN is_default boolean DEFAULT false;
  END IF;
END $$;

UPDATE public.integrations
SET is_default = true
WHERE platform = 'youtube'
  AND is_active = true
  AND (credentials->>'refresh_token') IS NOT NULL
  AND is_default = false;
