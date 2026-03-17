/*
  # Create Alfie AI Instructions System

  1. New Tables
    - `alfie_ai_instructions`
      - `id` (uuid, primary key)
      - `title` (text, required) - short descriptive name for the instruction
      - `category` (text, required) - grouping: tone_of_voice, response_style, context_rules, persona, boundaries, formatting
      - `instruction_text` (text, required) - the actual instruction content
      - `priority` (integer, default 0) - ordering priority (higher = applied first)
      - `is_active` (boolean, default true) - whether this instruction is currently in effect
      - `created_by` (uuid, FK to auth.users)
      - `updated_by` (uuid, FK to auth.users, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `alfie_ai_instructions` table
    - Super admins and national admins can manage instructions
    - Authenticated users can read active instructions

  3. Important Notes
    - This table stores system-level instructions that govern how the Alfie AI assistant
      communicates, responds, and behaves. Examples include tone of voice, what to say
      in specific situations, how to use resources, persona guidelines, etc.
    - Unlike corrections (which fix specific wrong answers), these are general behavioral
      directives that shape every interaction.
*/

CREATE TABLE IF NOT EXISTS alfie_ai_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  instruction_text text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alfie_ai_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage ai instructions"
  ON alfie_ai_instructions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  );

CREATE POLICY "National admins can manage ai instructions"
  ON alfie_ai_instructions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

CREATE POLICY "Authenticated users can read active ai instructions"
  ON alfie_ai_instructions
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE INDEX IF NOT EXISTS idx_alfie_ai_instructions_category ON alfie_ai_instructions(category);
CREATE INDEX IF NOT EXISTS idx_alfie_ai_instructions_active ON alfie_ai_instructions(is_active);
CREATE INDEX IF NOT EXISTS idx_alfie_ai_instructions_priority ON alfie_ai_instructions(priority DESC);

CREATE OR REPLACE FUNCTION update_alfie_ai_instructions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_alfie_ai_instructions_updated_at
  BEFORE UPDATE ON alfie_ai_instructions
  FOR EACH ROW
  EXECUTE FUNCTION update_alfie_ai_instructions_updated_at();
