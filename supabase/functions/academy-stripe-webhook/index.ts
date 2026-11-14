// Sailing Academy: Stripe tells us about each skipper's free week and plan, and we keep
// academy_subscriptions in step. It also holds the line on "one free week per skipper": a card
// that has already had a free week (on any account) ends the new one at once, so that plan starts
// straight away instead.
//
// Stripe webhook endpoint (no JWT). Needs STRIPE_SECRET_KEY and STRIPE_ACADEMY_WEBHOOK_SECRET.
// Events: checkout.session.completed, customer.subscription.created / updated / deleted.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.10.0';

const ok = (msg = 'ok', status = 200) => new Response(msg, { status });

Deno.serve(async (req) => {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  const secret = Deno.env.get('STRIPE_ACADEMY_WEBHOOK_SECRET');
  if (!key || !secret) return ok('Not configured', 500);
  const stripe = new Stripe(key, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const sig = req.headers.get('stripe-signature');
  if (!sig) return ok('No signature', 400);
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    console.error('academy webhook: bad signature', e);
    return ok('Bad signature', 400);
  }

  const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

  /** Write what Stripe says about this subscription onto the skipper's row. */
  const sync = async (sub: Stripe.Subscription) => {
    let userId = sub.metadata?.user_id;
    if (!userId) {
      const { data } = await db.from('academy_subscriptions').select('user_id').eq('stripe_customer_id', String(sub.customer)).maybeSingle();
      userId = data?.user_id;
    }
    if (!userId) { console.warn('academy webhook: no skipper for', sub.id); return null; }
    const item = sub.items?.data?.[0];
    const row: Record<string, unknown> = {
      user_id: userId,
      status: sub.status,
      plan: sub.metadata?.plan === 'member' ? 'member' : 'academy',
      billing_interval: item?.price?.recurring?.interval === 'month' ? 'month' : 'year',
      member_club_id: sub.metadata?.member_club_id || null,
      stripe_customer_id: String(sub.customer),
      stripe_subscription_id: sub.id,
      trial_end: iso(sub.trial_end),
      current_period_end: iso(sub.current_period_end),
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    };
    if (sub.status === 'trialing' && sub.trial_start) row.trial_started_at = iso(sub.trial_start);
    const { error } = await db.from('academy_subscriptions').upsert(row, { onConflict: 'user_id' });
    if (error) console.error('academy webhook: upsert', error);
    return userId;
  };

  /** Claim this free week for the card, account and device. A card that's had one already ends it. */
  const claimTrial = async (sub: Stripe.Subscription, userId: string) => {
    if (sub.status !== 'trialing') return;
    const claim = async (kind: string, value: string | null | undefined) => {
      if (!value) return true;
      const { error } = await db.from('academy_trial_claims').insert({ kind, value, user_id: userId });
      if (!error) return true;
      if (error.code !== '23505') { console.error('academy webhook: claim', error); return true; }
      const { data } = await db.from('academy_trial_claims').select('user_id').eq('kind', kind).eq('value', value).maybeSingle();
      return data?.user_id === userId;
    };
    await claim('user', userId);
    await claim('device', sub.metadata?.device_id);
    let fingerprint: string | null = null;
    try {
      const pmId = typeof sub.default_payment_method === 'string' ? sub.default_payment_method : sub.default_payment_method?.id;
      if (pmId) fingerprint = (await stripe.paymentMethods.retrieve(pmId)).card?.fingerprint ?? null;
    } catch (e) { console.warn('academy webhook: card', e); }
    if (!(await claim('card', fingerprint))) {
      // This card has had its free week: the plan starts now.
      const ended = await stripe.subscriptions.update(sub.id, { trial_end: 'now', proration_behavior: 'none' });
      await sync(ended);
      console.log('academy webhook: repeat card, free week ended for', userId);
    }
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode !== 'subscription' || !s.subscription) break;
        const sub = await stripe.subscriptions.retrieve(String(s.subscription));
        const userId = await sync(sub);
        if (userId) await claimTrial(sub, userId);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await sync(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (e) {
    console.error('academy webhook: handling', event.type, e);
    return ok('Error', 500);
  }
  return ok();
});
