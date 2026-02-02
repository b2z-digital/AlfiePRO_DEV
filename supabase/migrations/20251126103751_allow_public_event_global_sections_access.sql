/*
  # Allow Public Access to Event Website Global Sections

  1. Changes
    - Add SELECT policy for anonymous users to view event global sections (header, menu, footer)
    - This enables public visitors to see the header/footer on published event websites

  2. Security
    - Policy only allows SELECT (read) operations
    - Only applies to anonymous users viewing published event websites
*/

-- Allow anonymous users to view global sections for published event websites
CREATE POLICY "Anonymous users can view published event global sections"
  ON event_global_sections
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_global_sections.event_website_id
      AND ew.enabled = true
      AND ew.website_published = true
    )
  );
