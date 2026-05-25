/*
  # Add diagram and AskAlfie ruling support to protests

  1. Modified Tables
    - `event_protests`
      - `diagram_image` (text) - Base64 encoded diagram image drawn via the scenario canvas
      - `alfie_ruling` (text) - AskAlfie's AI ruling recommendation for the protest
      - `alfie_ruling_confidence` (text) - AI confidence level (high, medium, low)
      - `alfie_rules_cited` (text) - Rules cited by AskAlfie in the ruling

  2. Important Notes
    - diagram_image stores base64 data URL of the incident diagram
    - alfie_ruling stores the AI-generated ruling recommendation
    - These fields are optional and don't affect existing protest workflow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_protests' AND column_name = 'diagram_image'
  ) THEN
    ALTER TABLE event_protests ADD COLUMN diagram_image text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_protests' AND column_name = 'alfie_ruling'
  ) THEN
    ALTER TABLE event_protests ADD COLUMN alfie_ruling text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_protests' AND column_name = 'alfie_ruling_confidence'
  ) THEN
    ALTER TABLE event_protests ADD COLUMN alfie_ruling_confidence text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_protests' AND column_name = 'alfie_rules_cited'
  ) THEN
    ALTER TABLE event_protests ADD COLUMN alfie_rules_cited text;
  END IF;
END $$;
