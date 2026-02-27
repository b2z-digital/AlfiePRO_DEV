/*
  # Allow public read access to committee data flagged for website display

  ## Changes
  - Adds a SELECT policy on `committee_position_definitions` for anonymous users
    restricted to rows where show_on_website = true
  - Adds a SELECT policy on `committee_positions` for anonymous users
    so the public contact page can show assigned members for website-visible positions

  ## Security
  - Anonymous users can only READ, never write
  - committee_position_definitions: limited to show_on_website = true rows only
  - committee_positions: limited to clubs that have at least one show_on_website position
    (effectively only exposes data already visible via the position definition policy)
*/

CREATE POLICY "Public can view website-visible position definitions"
  ON committee_position_definitions
  FOR SELECT
  TO anon
  USING (show_on_website = true);

CREATE POLICY "Public can view committee position assignments"
  ON committee_positions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM committee_position_definitions cpd
      WHERE cpd.id = committee_positions.position_definition_id
      AND cpd.show_on_website = true
    )
  );
