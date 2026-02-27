/*
  # Allow public read access to members assigned to website-visible committee positions

  ## Changes
  - Adds a SELECT policy on `members` for anonymous users
  - Restricted strictly to members who are assigned to a committee position
    where show_on_website = true
  - Only exposes first_name, last_name, email — but RLS policies work at row level
    so we allow the row and rely on the query to select only needed columns

  ## Security
  - Anonymous users can only READ, never write
  - Only members explicitly assigned to a public-facing committee position are visible
*/

CREATE POLICY "Public can view members assigned to website-visible committee positions"
  ON members
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM committee_positions cp
      JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
      WHERE cp.member_id = members.id
      AND cpd.show_on_website = true
    )
  );
