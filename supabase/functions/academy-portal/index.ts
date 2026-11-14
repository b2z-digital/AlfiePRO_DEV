// Sailing Academy: open Stripe's billing page for the signed-in skipper, to change card, see
// receipts, or stop their plan.
// POST { returnUrl } → { url }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.10.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function safeUrl(u: unknown): string {
  const fallback = 'https://academy.alfiepro.com.au/sail';
  if (typeof u !== 'string') return fallback;
  try {
    const x = new URL(u);
    return ['academy.alfiepro.com.au', 'app.alfiepro.com.au', 'localhost', '127.0.0.1'].includes(x.hostname) ? x.toString() : fallback;
  } catch { return fallback; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Please sign in first.' }, 401);
    const asUser = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Please sign in first.' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: row } = await db.from('academy_subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
    if (!row?.stripe_customer_id) return json({ error: 'There is no plan to manage yet.' }, 404);
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) return json({ error: 'Payments are not switched on yet.' }, 503);
    const stripe = new Stripe(key, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() });
    const body = await req.json().catch(() => ({}));
    const s = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: safeUrl(body.returnUrl) });
    return json({ url: s.url });
  } catch (e) {
    console.error('academy-portal', e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
