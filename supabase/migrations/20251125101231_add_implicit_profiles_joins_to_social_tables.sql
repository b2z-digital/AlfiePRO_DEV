/*
  # Add implicit foreign keys for PostgREST joins to profiles

  1. Problem
    - PostgREST needs foreign keys to perform implicit joins
    - social_posts.author_id and social_connections.connected_user_id reference auth.users
    - But queries want to join to profiles table using author_id/connected_user_id
    
  2. Solution
    - Since auth.users and profiles both use the same UUID (user id)
    - We can add additional foreign keys to profiles alongside existing auth.users FKs
    - This allows PostgREST to join to profiles implicitly

  3. Changes
    - Add social_posts.author_id -> profiles.id FK (for implicit joins)
    - Add social_connections.connected_user_id -> profiles.id FK
    - Add social_connections.user_id -> profiles.id FK
    - Add social_comments.author_id -> profiles.id FK
    - Add social_group_members.user_id -> profiles.id FK
*/

-- For social_posts author
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_posts_author_id_profiles_fkey'
  ) THEN
    ALTER TABLE social_posts
    ADD CONSTRAINT social_posts_author_id_profiles_fkey
    FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- For social_connections
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_connections_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE social_connections
    ADD CONSTRAINT social_connections_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_connections_connected_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE social_connections
    ADD CONSTRAINT social_connections_connected_user_id_profiles_fkey
    FOREIGN KEY (connected_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- For social_comments
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_comments_author_id_profiles_fkey'
  ) THEN
    ALTER TABLE social_comments
    ADD CONSTRAINT social_comments_author_id_profiles_fkey
    FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- For social_group_members
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_group_members_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE social_group_members
    ADD CONSTRAINT social_group_members_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
