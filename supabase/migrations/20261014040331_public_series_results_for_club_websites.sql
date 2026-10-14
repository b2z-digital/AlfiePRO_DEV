/*
# Public read access to series results on club websites

## Problem
Club websites show one-off race results publicly, but series and series rounds
(e.g. a weekly handicap series) could not be read by visitors, so series results
and calendar entries were missing from public club sites.

## Changes
1. Grant SELECT (read only) on `race_series` and `race_series_rounds` to the anon role.
2. Add SELECT policies letting anon read series and rounds only for clubs whose
   website domain is active (domain_status 'active' or 'custom').

## Security
- Read only: no insert, update or delete access is granted to the public.
- Series of clubs without an active website remain hidden.
- Series not attached to a club (personal race-officer series) remain hidden.
*/

GRANT SELECT ON race_series TO anon;
GRANT SELECT ON race_series_rounds TO anon;

DROP POLICY IF EXISTS "Public can view series of clubs with active websites" ON race_series;
CREATE POLICY "Public can view series of clubs with active websites"
  ON race_series FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = race_series.club_id
        AND c.domain_status IN ('active', 'custom')
    )
  );

DROP POLICY IF EXISTS "Public can view series rounds of clubs with active websites" ON race_series_rounds;
CREATE POLICY "Public can view series rounds of clubs with active websites"
  ON race_series_rounds FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = race_series_rounds.club_id
        AND c.domain_status IN ('active', 'custom')
    )
  );
