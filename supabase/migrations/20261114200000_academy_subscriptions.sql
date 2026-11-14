-- Sailing Academy subscriptions.
--
-- One row per skipper who has started a free week or a plan. Stripe is the source of truth: the
-- academy-stripe-webhook function (service role) writes these rows; a skipper can only read their own.
-- Nothing here touches clubs, members, events or results.

CREATE TABLE IF NOT EXISTS public.academy_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stripe's subscription status, as last told by the webhook.
  status text NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),
  -- 'academy' is the public price; 'member' is the AlfiePRO club member price.
  plan text CHECK (plan IN ('academy', 'member')),
  billing_interval text CHECK (billing_interval IN ('month', 'year')),
  -- The club whose membership gave the member price (for the "Your plan" screen).
  member_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  -- When this skipper's one free week began (never cleared).
  trial_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academy_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Skippers read their own Academy plan" ON public.academy_subscriptions;
CREATE POLICY "Skippers read their own Academy plan"
  ON public.academy_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No insert/update/delete policies: only the service role (the Stripe functions) writes.

-- One free week per skipper: each card (Stripe's card fingerprint), account and device can start
-- only one. Service role only (no policies).
CREATE TABLE IF NOT EXISTS public.academy_trial_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('card', 'user', 'device')),
  value text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
ALTER TABLE public.academy_trial_claims ENABLE ROW LEVEL SECURITY;

-- The club membership that earns the member price: a current (active, not archived) member record
-- linked to this skipper, or one under their confirmed email address. The newest-renewing first.
CREATE OR REPLACE FUNCTION public.academy_member_club(p_user uuid)
RETURNS TABLE (club_id uuid, club_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.club_id, c.name
  FROM public.members m
  JOIN public.clubs c ON c.id = m.club_id
  LEFT JOIN auth.users u ON u.id = p_user
  WHERE m.membership_status = 'active'
    AND m.archived_at IS NULL
    AND (m.user_id = p_user
         OR (m.user_id IS NULL AND u.email_confirmed_at IS NOT NULL AND lower(m.email) = lower(u.email)))
  ORDER BY (m.user_id = p_user) DESC, m.renewal_date DESC NULLS LAST
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.academy_member_club(uuid) FROM PUBLIC, anon, authenticated;
-- (the service role keeps access)

-- The same, for the signed-in skipper only: "you're a member of …, member price applies".
CREATE OR REPLACE FUNCTION public.academy_my_membership()
RETURNS TABLE (club_id uuid, club_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.academy_member_club(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.academy_my_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_my_membership() TO authenticated;
