/*
  # Add text content support to tuning guides

  1. Modified Tables
    - `alfie_tuning_guides`
      - Make `storage_path`, `file_name`, `file_size` nullable to allow text-only entries
      - Add `content_text` column for direct text input (nullable text)
      - Add `input_type` column to distinguish between 'pdf' and 'text' entries

  2. Notes
    - Existing PDF-based guides are unaffected (they keep their storage_path/file_name/file_size)
    - New text-only guides will have null storage_path and populated content_text
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tuning_guides' AND column_name = 'content_text'
  ) THEN
    ALTER TABLE alfie_tuning_guides ADD COLUMN content_text text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tuning_guides' AND column_name = 'input_type'
  ) THEN
    ALTER TABLE alfie_tuning_guides ADD COLUMN input_type text DEFAULT 'pdf';
  END IF;
END $$;

ALTER TABLE alfie_tuning_guides ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE alfie_tuning_guides ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE alfie_tuning_guides ALTER COLUMN file_size DROP NOT NULL;
ALTER TABLE alfie_tuning_guides ALTER COLUMN file_size SET DEFAULT 0;
