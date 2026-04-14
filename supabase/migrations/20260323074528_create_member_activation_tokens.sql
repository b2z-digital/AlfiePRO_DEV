/*
  # Create Member Activation Tokens

  1. New Tables
    - `member_activation_tokens`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `email` (text, not null)
      - `token` (text, unique, not null)
      - `expires_at` (timestamptz, not null)
      - `used_at` (timestamptz, nullable)
      - `created_at` (timestamptz, default now)
  
  2. Security
    - Enable RLS on table
    - No direct client access needed - only accessed via edge functions with service role
  
  3. Notes
    - Tokens are generated server-side and verified server-side
    - Bypasses Supabase PKCE flow entirely for member activation
    - Tokens expire after 7 days
*/

CREATE TABLE IF NOT EXISTS member_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE member_activation_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_member_activation_tokens_token ON member_activation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_member_activation_tokens_email ON member_activation_tokens(email);
