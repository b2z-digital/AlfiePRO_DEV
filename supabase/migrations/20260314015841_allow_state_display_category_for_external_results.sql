/*
  # Allow state display categories for external results

  1. Changes
    - Remove CHECK constraint on `external_result_events.display_category` that only allowed 'national' and 'world'
    - Remove CHECK constraint on `external_result_sources.display_category` that only allowed 'national' and 'world'
    - Both columns now accept any text value to support state association categories (e.g., 'state_<uuid>')

  2. Notes
    - State events are stored with display_category = 'state_<state_association_id>'
    - This enables assigning scraped events to specific state associations
*/

ALTER TABLE external_result_events DROP CONSTRAINT IF EXISTS external_result_events_display_category_check;
ALTER TABLE external_result_sources DROP CONSTRAINT IF EXISTS external_result_sources_display_category_check;