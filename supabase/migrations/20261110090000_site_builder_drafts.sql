-- Site builder: keep edits as a draft until the club publishes them.
-- Public pages keep reading `rows`; the builder writes `draft_rows` and copies it to `rows` on publish.
ALTER TABLE public.organization_page_layouts ADD COLUMN IF NOT EXISTS draft_rows jsonb;
COMMENT ON COLUMN public.organization_page_layouts.draft_rows IS 'Site builder changes not yet published. NULL when the page matches what is live.';
