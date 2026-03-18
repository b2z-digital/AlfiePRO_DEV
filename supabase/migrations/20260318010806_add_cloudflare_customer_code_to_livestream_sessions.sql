/*
  # Add Cloudflare customer code to livestream_sessions

  1. Modified Tables
    - `livestream_sessions`
      - Added `cloudflare_customer_code` (text, nullable) - Cloudflare Stream customer subdomain code for iframe embeds

  2. Purpose
    - Enables embedding live streams directly in AlfieTV using Cloudflare Stream player
    - The customer code is extracted from the Cloudflare playback URL during live input creation
    - Embed URL format: https://customer-{CODE}.cloudflarestream.com/{LIVE_INPUT_ID}/iframe
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'cloudflare_customer_code'
  ) THEN
    ALTER TABLE public.livestream_sessions ADD COLUMN cloudflare_customer_code text;
  END IF;
END $$;