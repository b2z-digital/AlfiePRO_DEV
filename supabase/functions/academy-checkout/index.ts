// Sailing Academy: the price you'll pay, and the way to Stripe's checkout for your free week.
//
// POST { action: 'quote' }                       → which price applies (member or public) and whether a free week is still available
// POST { action: 'checkout', interval, deviceId, returnBase } → { url } of a Stripe Checkout page
//
// The member price is worked out here, never trusted from the browser: a current, unarchived member
// record of an AlfiePRO club linked to this login (or under its confirmed email). One free week per
// skipper: not if this account, this device or (checked again by the webhook) this card has had one.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.10.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** A$ cents, GST included. Keep in step with src/components/academy/plans.ts. */
const PRICES = {
  academy: { month: 1299, year: 11900, name: 'AlfiePRO Sailing Academy' },
  member: { month: 899, year: 7900, name: 'AlfiePRO Sailing Academy (club member)' },
} as const;
const TRIAL_DAYS = 7;
const LIVE = new Set(['trialing', 'active', 'past_due']);

/** Where Stripe may send the skipper back to: the Academy site, or its copy inside the app. */
function safeBase(b: unknown): string {
  const fallback = 'https://academy.alfiepro.com.au';
  if (typeof b !== 'string') return fallback;
  try {
    const u = new URL(b);
    const ok = u.hostname === 'academy.alfiepro.com.au' || u.hostname === 'app.alfiepro.com.au'
      || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (!ok) return fallback;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return fallback; }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Please sign in first.' }, 401);
    const asUser = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Please sign in first.' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const body = await req.json().catch(() => ({}));
    const action = body.action === 'checkout' ? 'checkout' : 'quote';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 80) : '';

    const { data: clubRows } = await db.rpc('academy_member_club', { p_user: user.id });
    const club = Array.isArray(clubRows) && clubRows.length ? clubRows[0] as { club_id: string; club_name: string } : null;
    const plan: 'member' | 'academy' = club ? 'member' : 'academy';

    const { data: row } = await db.from('academy_subscriptions').select('*').eq('user_id', user.id).maybeSingle();
    const claimed = async (kind: string, value: string) => {
      if (!value) return false;
      const { data } = await db.from('academy_trial_claims').select('id').eq('kind', kind).eq('value', value).maybeSingle();
      return !!data;
    };
    const trial = !row?.trial_started_at && !(await claimed('user', user.id)) && !(await claimed('device', deviceId));

    const quote = {
      plan,
      club: club ? { id: club.club_id, name: club.club_name } : null,
      trial,
      trialDays: TRIAL_DAYS,
      prices: { month: PRICES[plan].month, year: PRICES[plan].year },
      status: row?.status ?? 'none',
    };
    if (action === 'quote') return json(quote);

    if (row && LIVE.has(row.status)) return json({ ...quote, already: true });
    const interval: 'month' | 'year' = body.interval === 'month' ? 'month' : 'year';

    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) return json({ error: 'Payments are not switched on yet.' }, 503);
    const stripe = new Stripe(key, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });

    let customer = row?.stripe_customer_id as string | undefined;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, name: [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || undefined, metadata: { user_id: user.id, source: 'sailing_academy' } });
      customer = c.id;
      await db.from('academy_subscriptions').upsert({ user_id: user.id, stripe_customer_id: customer, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }

    const base = safeBase(body.returnBase);
    const meta = { user_id: user.id, plan, interval, member_club_id: club?.club_id ?? '', device_id: deviceId, trial: trial ? '1' : '0' };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: PRICES[plan][interval],
          recurring: { interval },
          product_data: { name: PRICES[plan].name },
          tax_behavior: 'inclusive',
        },
      }],
      payment_method_collection: 'always',
      subscription_data: {
        ...(trial ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}),
        metadata: meta,
      },
      metadata: meta,
      allow_promotion_codes: true,
      success_url: `${base}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/free-week`,
    });
    return json({ ...quote, interval, url: session.url });
  } catch (e) {
    console.error('academy-checkout', e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
