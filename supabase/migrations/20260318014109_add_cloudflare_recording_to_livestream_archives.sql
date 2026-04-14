/*
  # Add Cloudflare Recording Support to Livestream Archives

  1. Modified Tables
    - `livestream_archives`
      - `cloudflare_video_id` (text) - Cloudflare Stream video/recording ID
      - `cloudflare_customer_code` (text) - Customer subdomain code for embed URLs
      - `cloudflare_playback_url` (text) - Direct playback URL from Cloudflare
      - `source` (text) - Recording source: 'youtube' or 'cloudflare', defaults to 'youtube'
    - Make `youtube_video_id` and `youtube_url` nullable since recordings may come from Cloudflare

  2. Important Notes
    - Cloudflare Stream recordings are automatically created when live inputs have recording enabled
    - The embed URL pattern is: https://customer-{CODE}.cloudflarestream.com/{VIDEO_ID}/iframe
    - Existing archives remain untouched (source defaults to 'youtube')
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_archives' AND column_name = 'cloudflare_video_id'
  ) THEN
    ALTER TABLE public.livestream_archives ADD COLUMN cloudflare_video_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_archives' AND column_name = 'cloudflare_customer_code'
  ) THEN
    ALTER TABLE public.livestream_archives ADD COLUMN cloudflare_customer_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_archives' AND column_name = 'cloudflare_playback_url'
  ) THEN
    ALTER TABLE public.livestream_archives ADD COLUMN cloudflare_playback_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_archives' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.livestream_archives ADD COLUMN source text DEFAULT 'youtube';
  END IF;
END $$;

ALTER TABLE public.livestream_archives ALTER COLUMN youtube_video_id DROP NOT NULL;
ALTER TABLE public.livestream_archives ALTER COLUMN youtube_url DROP NOT NULL;