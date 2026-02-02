/*
  # Allow Public View of Completed Races

  1. Purpose
    - Allow anonymous users to view completed races for public club websites
    - Only completed races are visible to public

  2. Security
    - Only SELECT access
    - Only completed races
    - No write access for anonymous users
*/

-- Create policy to allow public to view completed races
CREATE POLICY "Public can view completed races"
  ON public.quick_races FOR SELECT
  TO public, anon, authenticated
  USING (completed = true);
