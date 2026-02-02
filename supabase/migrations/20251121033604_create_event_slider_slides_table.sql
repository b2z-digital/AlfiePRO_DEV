/*
  # Create Event Slider Slides Table

  1. New Tables
    - `event_slider_slides`
      - `id` (uuid, primary key)
      - `event_website_id` (uuid, foreign key to event_websites)
      - `widget_id` (uuid, nullable - links to specific widget instance)
      - `title` (text, nullable)
      - `subtitle` (text, nullable)
      - `image_url` (text, required)
      - `button_text` (text, nullable)
      - `button_url` (text, nullable)
      - `display_order` (integer, default 0)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `event_slider_slides` table
    - Add policies for event website admins to manage slides
    - Add public read policy for published event websites

  3. Indexes
    - Index on event_website_id for fast lookups
    - Index on widget_id for widget-specific slides
    - Index on display_order for sorting
*/

CREATE TABLE IF NOT EXISTS event_slider_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid NOT NULL REFERENCES event_websites(id) ON DELETE CASCADE,
  widget_id uuid,
  title text,
  subtitle text,
  image_url text NOT NULL,
  button_text text,
  button_url text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE event_slider_slides ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_event_slider_slides_website ON event_slider_slides(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_slider_slides_widget ON event_slider_slides(widget_id);
CREATE INDEX IF NOT EXISTS idx_event_slider_slides_order ON event_slider_slides(display_order);

CREATE POLICY "Public can view slides for published event websites"
  ON event_slider_slides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_websites
      WHERE event_websites.id = event_slider_slides.event_website_id
      AND event_websites.status = 'published'
    )
  );

CREATE POLICY "Event website admins can manage slides"
  ON event_slider_slides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_slider_slides.event_website_id
      AND (
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.club_id = pe.club_id
          AND uc.role IN ('admin', 'editor')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON pe.id = ew.event_id
      WHERE ew.id = event_slider_slides.event_website_id
      AND (
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.club_id = pe.club_id
          AND uc.role IN ('admin', 'editor')
        )
      )
    )
  );