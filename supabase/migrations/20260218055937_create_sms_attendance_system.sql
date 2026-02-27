/*
  # SMS Attendance System for Automated Event Notifications

  1. New Tables
    - `sms_token_balances` - Per-club token balance for SMS usage
      - `club_id` (uuid, FK to clubs) - The club this balance belongs to
      - `balance` (integer) - Current token count
      - `total_purchased` (integer) - Lifetime tokens purchased
      - `total_used` (integer) - Lifetime tokens consumed
    - `sms_token_transactions` - Ledger of token purchases and usage
      - `club_id` (uuid, FK to clubs)
      - `transaction_type` (text) - 'purchase', 'usage', 'refund', 'bonus'
      - `amount` (integer) - Positive for credits, negative for debits
      - `description` (text) - Human-readable description
      - `reference_id` (uuid, nullable) - Link to sms_event_logs entry
      - `stripe_payment_id` (text, nullable) - For purchases via Stripe
    - `sms_club_settings` - Per-club SMS feature configuration
      - `club_id` (uuid, FK to clubs, unique)
      - `is_enabled` (boolean) - Master on/off toggle
      - `auto_send_days_before` (integer) - Days before event to send (default 7)
      - `send_time` (time) - Time of day to send (default 09:00)
      - `message_template` (text) - Custom message template
      - `auto_send_enabled` (boolean) - Whether auto-sending is active
    - `sms_event_logs` - Per-event SMS broadcast log
      - `club_id` (uuid, FK to clubs)
      - `event_id` (text) - Quick race ID or series+round reference
      - `event_name` (text) - Event name at time of send
      - `event_date` (date) - Event date
      - `total_sent` (integer) - Number of SMS sent
      - `total_delivered` (integer) - Twilio delivery confirmations
      - `total_responses` (integer) - Replies received
      - `status` (text) - 'pending', 'sending', 'completed', 'failed'
      - `sent_at` (timestamptz) - When the batch was sent
    - `sms_message_log` - Individual message tracking
      - `event_log_id` (uuid, FK to sms_event_logs)
      - `member_id` (uuid, FK to members)
      - `phone_number` (text) - Phone number sent to (masked for privacy)
      - `twilio_message_sid` (text) - Twilio tracking ID
      - `status` (text) - 'queued', 'sent', 'delivered', 'failed', 'responded'
      - `response` (text, nullable) - 'yes', 'no', 'maybe'
      - `response_raw` (text, nullable) - Raw reply text
      - `delivered_at` (timestamptz, nullable)
      - `responded_at` (timestamptz, nullable)

  2. Security
    - Enable RLS on all tables
    - Club admins can manage their club's SMS settings and view logs
    - Members cannot access SMS infrastructure tables

  3. Feature Control
    - Adds 'sms_attendance' to platform_feature_controls (disabled by default)
*/

-- SMS Token Balances
CREATE TABLE IF NOT EXISTS public.sms_token_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  total_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(club_id)
);

ALTER TABLE public.sms_token_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view own token balance"
  ON public.sms_token_balances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_token_balances.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can update own token balance"
  ON public.sms_token_balances
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_token_balances.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_token_balances.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can insert own token balance"
  ON public.sms_token_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_token_balances.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- SMS Token Transactions (ledger)
CREATE TABLE IF NOT EXISTS public.sms_token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'usage', 'refund', 'bonus')),
  amount integer NOT NULL,
  description text NOT NULL DEFAULT '',
  reference_id uuid,
  stripe_payment_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view own token transactions"
  ON public.sms_token_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_token_transactions.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can insert own token transactions"
  ON public.sms_token_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_token_transactions.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- SMS Club Settings
CREATE TABLE IF NOT EXISTS public.sms_club_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  auto_send_days_before integer NOT NULL DEFAULT 7,
  send_time time NOT NULL DEFAULT '09:00:00',
  message_template text NOT NULL DEFAULT 'Hi {first_name}, {event_name} is on {event_date} at {venue}. Will you be sailing? Reply YES, NO, or MAYBE.',
  include_boat_class_filter boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(club_id)
);

ALTER TABLE public.sms_club_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view own SMS settings"
  ON public.sms_club_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_club_settings.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can insert own SMS settings"
  ON public.sms_club_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_club_settings.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can update own SMS settings"
  ON public.sms_club_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_club_settings.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_club_settings.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- SMS Event Logs (per broadcast)
CREATE TABLE IF NOT EXISTS public.sms_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL DEFAULT '',
  event_date date,
  boat_class text,
  venue text,
  total_sent integer NOT NULL DEFAULT 0,
  total_delivered integer NOT NULL DEFAULT 0,
  total_responses integer NOT NULL DEFAULT 0,
  yes_count integer NOT NULL DEFAULT 0,
  no_count integer NOT NULL DEFAULT 0,
  maybe_count integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'completed', 'failed', 'cancelled')),
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'auto')),
  sent_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view own SMS event logs"
  ON public.sms_event_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_event_logs.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can insert own SMS event logs"
  ON public.sms_event_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_event_logs.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can update own SMS event logs"
  ON public.sms_event_logs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_event_logs.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_event_logs.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- SMS Individual Message Log
CREATE TABLE IF NOT EXISTS public.sms_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_log_id uuid NOT NULL REFERENCES public.sms_event_logs(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  member_name text NOT NULL DEFAULT '',
  phone_number_masked text NOT NULL DEFAULT '',
  twilio_message_sid text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'responded')),
  response text CHECK (response IN ('yes', 'no', 'maybe')),
  response_raw text,
  error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view own SMS message logs"
  ON public.sms_message_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_message_log.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can insert own SMS message logs"
  ON public.sms_message_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_message_log.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Club admins can update own SMS message logs"
  ON public.sms_message_log
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_message_log.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = sms_message_log.club_id
        AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sms_token_balances_club ON public.sms_token_balances(club_id);
CREATE INDEX IF NOT EXISTS idx_sms_token_transactions_club ON public.sms_token_transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_sms_token_transactions_created ON public.sms_token_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_club_settings_club ON public.sms_club_settings(club_id);
CREATE INDEX IF NOT EXISTS idx_sms_event_logs_club ON public.sms_event_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_sms_event_logs_event ON public.sms_event_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_sms_event_logs_status ON public.sms_event_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_message_log_event ON public.sms_message_log(event_log_id);
CREATE INDEX IF NOT EXISTS idx_sms_message_log_twilio_sid ON public.sms_message_log(twilio_message_sid);
CREATE INDEX IF NOT EXISTS idx_sms_message_log_member ON public.sms_message_log(member_id);

-- Add SMS Attendance to platform feature controls (OFF by default)
INSERT INTO public.platform_feature_controls (feature_key, feature_label, feature_description, feature_group, is_globally_enabled)
VALUES (
  'sms_attendance',
  'SMS Attendance',
  'Automated SMS notifications for event attendance with YES/NO/MAYBE replies that sync to event RSVP. Requires SMS tokens.',
  'communications',
  false
)
ON CONFLICT (feature_key) DO NOTHING;
