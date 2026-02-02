/*
  # Create User Modal Preferences Table

  1. New Tables
    - `user_modal_preferences`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `modal_type` (text) - e.g., 'row_settings', 'column_settings', 'widget_settings'
      - `position` (text) - 'left', 'right', or 'center'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (user_id, modal_type)

  2. Security
    - Enable RLS on `user_modal_preferences` table
    - Add policies for users to manage their own preferences
*/

CREATE TABLE IF NOT EXISTS public.user_modal_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  modal_type text NOT NULL,
  position text DEFAULT 'right' CHECK (position IN ('left', 'right', 'center')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, modal_type)
);

ALTER TABLE public.user_modal_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own modal preferences"
  ON public.user_modal_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own modal preferences"
  ON public.user_modal_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own modal preferences"
  ON public.user_modal_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own modal preferences"
  ON public.user_modal_preferences
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_modal_preferences_user_id 
  ON public.user_modal_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_user_modal_preferences_user_modal 
  ON public.user_modal_preferences(user_id, modal_type);
