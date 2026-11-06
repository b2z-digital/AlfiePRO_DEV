/*
  # Additional race documents on events and series

  1. Changes
    - Add nullable `additional_documents` jsonb (default '[]') to quick_races, race_series and public_events.
      Each item: { "name": text, "url": text, "type": "other" }.
    - Used by the create/edit event and series modal (Additional Documents) and shown in the
      event / round modal Documents tab. Series rounds read their series' documents.

  2. Security
    - No RLS changes; existing row policies cover the new column.
*/

ALTER TABLE public.quick_races   ADD COLUMN IF NOT EXISTS additional_documents jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.race_series   ADD COLUMN IF NOT EXISTS additional_documents jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.public_events ADD COLUMN IF NOT EXISTS additional_documents jsonb DEFAULT '[]'::jsonb;
