-- How to show each classifieds photo: turn it upright and frame it on the item.
-- Keyed by photo URL: { "<url>": { "r": 0|90|180|270, "x": 0-100, "y": 0-100,
--   "by": "ai"|"manual", "len": <bytes>, "at": <iso> } }
-- Filled automatically for imported (ARYA) listings and editable in the listing form.
alter table public.classifieds
  add column if not exists image_meta jsonb not null default '{}'::jsonb;

comment on column public.classifieds.image_meta is
  'Per-photo display settings keyed by image URL: r = clockwise turn to stand upright (0/90/180/270), x/y = item centre in % of the stored photo, by = ai|manual, len = file size when checked.';
