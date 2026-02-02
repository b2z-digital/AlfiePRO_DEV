/*
  # Fix Profiles RLS for User Signup

  The issue: When a new user signs up, the handle_new_user() trigger tries to create
  a profile, but RLS blocks it because:
  1. The trigger runs AFTER INSERT on auth.users
  2. At that moment, the user exists but has no session yet
  3. RLS policy requires "TO authenticated" but trigger can't authenticate
  4. Profile creation fails → "Database error saving new user"

  ## Solution
  Add a policy that allows profile creation for service role and during trigger execution.
  The trigger runs as SECURITY DEFINER so it bypasses RLS, but we need to ensure
  the profiles table allows inserts from the system.

  ## Changes
  1. Add policy to allow service role to insert profiles
  2. Ensure trigger can create profiles without authentication
*/

-- Drop existing restrictive INSERT policy if it exists
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Create a permissive policy for profile creation during signup
CREATE POLICY "Allow profile creation during signup"
  ON profiles
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    -- Allow if the user is creating their own profile
    auth.uid() = id
    -- OR if there's no current user (system/trigger creating profile)
    OR auth.uid() IS NULL
  );

-- Also ensure service role can do everything (for admin operations)
CREATE POLICY "Service role can manage all profiles"
  ON profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Allow profile creation during signup" ON profiles IS
'Allows profile creation during user signup when no session exists yet, or when user creates their own profile.';

COMMENT ON POLICY "Service role can manage all profiles" ON profiles IS
'Allows service role to perform any operation on profiles for admin functions and triggers.';
