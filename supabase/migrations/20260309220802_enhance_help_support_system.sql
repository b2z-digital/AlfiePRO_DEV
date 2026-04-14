/*
  # Enhance Help & Support System

  1. Enhancements to existing tables
    - `support_faqs`: Add platform_area column
    - `support_tickets`: Add platform_area, browser_info, screenshot_urls, satisfaction fields
    - `support_ticket_messages`: Add attachment_urls, sender_role columns
    - `support_tutorial_groups`: Add platform_section, target_audience, tutorial_count columns
    - `support_tutorials`: Add platform_area, transcript columns

  2. New Tables
    - `support_ticket_activity_log` - Track all changes to tickets
    - `support_canned_responses` - Pre-written responses for common issues

  3. Functions
    - `increment_faq_view_count` - Safely increment FAQ view counts
    - `increment_tutorial_view_count` - Safely increment tutorial view counts
    - `update_tutorial_group_count` - Auto-update tutorial count on group

  4. Security
    - RLS policies on new tables
    - Indexes for performance
*/

-- ============================================
-- ENHANCE support_faqs
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_faqs' AND column_name = 'platform_area'
  ) THEN
    ALTER TABLE support_faqs ADD COLUMN platform_area text DEFAULT 'general';
  END IF;
END $$;

-- ============================================
-- ENHANCE support_tickets
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'platform_area'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN platform_area text DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'browser_info'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN browser_info text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'screenshot_urls'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN screenshot_urls text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'satisfaction_rating'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN satisfaction_rating integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'satisfaction_comment'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN satisfaction_comment text;
  END IF;
END $$;

-- ============================================
-- ENHANCE support_ticket_messages
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_ticket_messages' AND column_name = 'attachment_urls'
  ) THEN
    ALTER TABLE support_ticket_messages ADD COLUMN attachment_urls text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_ticket_messages' AND column_name = 'sender_role'
  ) THEN
    ALTER TABLE support_ticket_messages ADD COLUMN sender_role text DEFAULT 'customer';
  END IF;
END $$;

-- ============================================
-- ENHANCE support_tutorial_groups
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tutorial_groups' AND column_name = 'platform_section'
  ) THEN
    ALTER TABLE support_tutorial_groups ADD COLUMN platform_section text DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tutorial_groups' AND column_name = 'target_audience'
  ) THEN
    ALTER TABLE support_tutorial_groups ADD COLUMN target_audience text DEFAULT 'all';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tutorial_groups' AND column_name = 'tutorial_count'
  ) THEN
    ALTER TABLE support_tutorial_groups ADD COLUMN tutorial_count integer DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- ENHANCE support_tutorials
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tutorials' AND column_name = 'platform_area'
  ) THEN
    ALTER TABLE support_tutorials ADD COLUMN platform_area text DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tutorials' AND column_name = 'transcript'
  ) THEN
    ALTER TABLE support_tutorials ADD COLUMN transcript text;
  END IF;
END $$;

-- ============================================
-- TICKET ACTIVITY LOG (new table)
-- ============================================
CREATE TABLE IF NOT EXISTS support_ticket_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text DEFAULT '',
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE support_ticket_activity_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'support_ticket_activity_log' AND policyname = 'Super admins can manage activity logs'
  ) THEN
    CREATE POLICY "Super admins can manage activity logs"
      ON support_ticket_activity_log FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'support_ticket_activity_log' AND policyname = 'Users can view activity on their tickets'
  ) THEN
    CREATE POLICY "Users can view activity on their tickets"
      ON support_ticket_activity_log FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM support_tickets t
          WHERE t.id = support_ticket_activity_log.ticket_id
          AND t.reporter_user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_activity_ticket ON support_ticket_activity_log(ticket_id);

-- ============================================
-- CANNED RESPONSES (new table)
-- ============================================
CREATE TABLE IF NOT EXISTS support_canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text DEFAULT 'general',
  usage_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE support_canned_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'support_canned_responses' AND policyname = 'Super admins can manage canned responses'
  ) THEN
    CREATE POLICY "Super admins can manage canned responses"
      ON support_canned_responses FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)
      );
  END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_support_faqs_category ON support_faqs(category_id);
CREATE INDEX IF NOT EXISTS idx_support_faqs_platform_area ON support_faqs(platform_area);
CREATE INDEX IF NOT EXISTS idx_support_faqs_published ON support_faqs(is_published);
CREATE INDEX IF NOT EXISTS idx_support_tutorials_group ON support_tutorials(group_id);
CREATE INDEX IF NOT EXISTS idx_support_tutorials_published ON support_tutorials(is_published);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter ON support_tickets(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id);

-- ============================================
-- FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION increment_faq_view_count(faq_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE support_faqs SET view_count = view_count + 1 WHERE id = faq_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_tutorial_view_count(tutorial_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE support_tutorials SET view_count = view_count + 1 WHERE id = tutorial_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_tutorial_group_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE support_tutorial_groups
    SET tutorial_count = (SELECT COUNT(*) FROM support_tutorials WHERE group_id = OLD.group_id)
    WHERE id = OLD.group_id;
    RETURN OLD;
  ELSE
    UPDATE support_tutorial_groups
    SET tutorial_count = (SELECT COUNT(*) FROM support_tutorials WHERE group_id = NEW.group_id)
    WHERE id = NEW.group_id;
    IF TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id AND OLD.group_id IS NOT NULL THEN
      UPDATE support_tutorial_groups
      SET tutorial_count = (SELECT COUNT(*) FROM support_tutorials WHERE group_id = OLD.group_id)
      WHERE id = OLD.group_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS update_tutorial_count ON support_tutorials;
CREATE TRIGGER update_tutorial_count
  AFTER INSERT OR UPDATE OR DELETE ON support_tutorials
  FOR EACH ROW
  EXECUTE FUNCTION update_tutorial_group_count();

-- ============================================
-- RLS POLICIES (ensure they exist)
-- ============================================
DO $$
BEGIN
  -- FAQ Categories
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_faq_categories' AND policyname = 'Super admins can manage FAQ categories') THEN
    CREATE POLICY "Super admins can manage FAQ categories"
      ON support_faq_categories FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_faq_categories' AND policyname = 'Authenticated users can view active FAQ categories') THEN
    CREATE POLICY "Authenticated users can view active FAQ categories"
      ON support_faq_categories FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;

  -- FAQs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_faqs' AND policyname = 'Super admins can manage FAQs') THEN
    CREATE POLICY "Super admins can manage FAQs"
      ON support_faqs FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_faqs' AND policyname = 'Authenticated users can view published FAQs') THEN
    CREATE POLICY "Authenticated users can view published FAQs"
      ON support_faqs FOR SELECT TO authenticated
      USING (is_published = true);
  END IF;

  -- Tutorial Groups
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tutorial_groups' AND policyname = 'Super admins can manage tutorial groups') THEN
    CREATE POLICY "Super admins can manage tutorial groups"
      ON support_tutorial_groups FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tutorial_groups' AND policyname = 'Authenticated users can view active tutorial groups') THEN
    CREATE POLICY "Authenticated users can view active tutorial groups"
      ON support_tutorial_groups FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;

  -- Tutorials
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tutorials' AND policyname = 'Super admins can manage tutorials') THEN
    CREATE POLICY "Super admins can manage tutorials"
      ON support_tutorials FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tutorials' AND policyname = 'Authenticated users can view published tutorials') THEN
    CREATE POLICY "Authenticated users can view published tutorials"
      ON support_tutorials FOR SELECT TO authenticated
      USING (is_published = true);
  END IF;

  -- Tickets
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'Super admins can manage all tickets') THEN
    CREATE POLICY "Super admins can manage all tickets"
      ON support_tickets FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'Users can view their own tickets') THEN
    CREATE POLICY "Users can view their own tickets"
      ON support_tickets FOR SELECT TO authenticated
      USING (reporter_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'Users can create tickets') THEN
    CREATE POLICY "Users can create tickets"
      ON support_tickets FOR INSERT TO authenticated
      WITH CHECK (reporter_user_id = auth.uid());
  END IF;

  -- Ticket Messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_ticket_messages' AND policyname = 'Super admins can manage all messages') THEN
    CREATE POLICY "Super admins can manage all messages"
      ON support_ticket_messages FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_ticket_messages' AND policyname = 'Users can view messages on their tickets') THEN
    CREATE POLICY "Users can view messages on their tickets"
      ON support_ticket_messages FOR SELECT TO authenticated
      USING (
        is_internal_note = false AND
        EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = support_ticket_messages.ticket_id AND t.reporter_user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_ticket_messages' AND policyname = 'Users can add messages to their tickets') THEN
    CREATE POLICY "Users can add messages to their tickets"
      ON support_ticket_messages FOR INSERT TO authenticated
      WITH CHECK (
        sender_user_id = auth.uid() AND
        is_internal_note = false AND
        EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = support_ticket_messages.ticket_id AND t.reporter_user_id = auth.uid() AND t.status NOT IN ('closed'))
      );
  END IF;
END $$;
