// Livestream credit top-ups through Alfie's Stripe account (prepaid; clubs pay for their own livestreams).
//
// POST { action: "checkout", clubId, amountCents, returnPath }  → { url }   (Stripe Checkout page)
// POST { action: "confirm",  clubId, checkoutId? }             → { credited, balanceCents }
//
// "confirm" checks every pending checkout for the club with Stripe and credits the paid ones,
// once each (the ledger's stripe_checkout_id is unique). The app calls it when the person comes
// back from Stripe and whenever the credit panel opens, so a payment is never lost even if the
// browser closed before returning. No webhook needed.
//
// Secrets: STRIPE_SECRET_KEY (already set for Alfie subscriptions).
// Deploy with JWT verification ON (the default).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.10.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*(alfiepro\.com\.au|alfie\.pro|amplifyapp\.com)$|^http:\/\/localhost(:\d+)?$/i;
const MIN_CENTS = 1000;
const MAX_CENTS = 100000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Sign in again" }, 401);

    const body = await req.json().catch(() => ({}));
    const clubId = String(body.clubId || "");
    if (!/^[0-9a-f-]{36}$/i.test(clubId)) return json({ error: "Missing club" }, 400);

    // Same rule as the credit panel: club admin, editor or race scorer, or a super admin
    const { data: allowed } = await asUser.rpc("livestream_can_manage_credit", { p_club: clubId });
    if (!allowed) return json({ error: "You can't manage this club's livestream credit" }, 403);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Payments aren't set up yet" }, 500);
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    if (body.action === "checkout") {
      const amount = Math.round(Number(body.amountCents));
      if (!Number.isFinite(amount) || amount < MIN_CENTS || amount > MAX_CENTS) {
        return json({ error: `Choose an amount between $${MIN_CENTS / 100} and $${MAX_CENTS / 100}` }, 400);
      }
      const { data: club } = await admin.from("clubs").select("name").eq("id", clubId).maybeSingle();
      const { data: cfg } = await admin.from("livestream_billing_settings").select("currency").maybeSingle();

      const origin = req.headers.get("Origin") || "";
      const base = ALLOWED_ORIGIN.test(origin) ? origin : "https://app.alfiepro.com.au";
      const path = typeof body.returnPath === "string" && body.returnPath.startsWith("/") && !body.returnPath.startsWith("//")
        ? body.returnPath.split("#")[0] : "/livestream";
      const sep = path.includes("?") ? "&" : "?";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: cfg?.currency || "aud",
            product_data: {
              name: "AlfiePRO livestream credit",
              description: `Prepaid livestream credit for ${club?.name || "your club"}. Used for live broadcasts in AlfieTV; recording races is free.`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        customer_email: user.email || undefined,
        success_url: `${base}${path}${sep}credit=done&checkout={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}${path}${sep}credit=cancelled`,
        metadata: { kind: "livestream_credit", club_id: clubId, user_id: user.id, amount_cents: String(amount) },
        payment_intent_data: {
          description: `AlfiePRO livestream credit · ${club?.name || clubId}`,
          metadata: { kind: "livestream_credit", club_id: clubId },
        },
      });

      await admin.from("livestream_credit_checkouts").insert({
        stripe_checkout_id: session.id, club_id: clubId, amount_cents: amount, created_by: user.id,
      });
      return json({ url: session.url });
    }

    if (body.action === "confirm") {
      // Pending checkouts for this club from the last 7 days (plus the one just returned from)
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: pending } = await admin
        .from("livestream_credit_checkouts")
        .select("stripe_checkout_id, amount_cents, created_by")
        .eq("club_id", clubId).eq("status", "pending").gte("created_at", since);

      let credited = 0;
      for (const p of pending || []) {
        const s = await stripe.checkout.sessions.retrieve(p.stripe_checkout_id).catch(() => null);
        if (!s) continue;
        if (s.metadata?.kind !== "livestream_credit" || s.metadata?.club_id !== clubId) continue;
        if (s.payment_status === "paid") {
          const cents = s.amount_total ?? p.amount_cents;
          const { error } = await admin.from("livestream_credit_ledger").insert({
            club_id: clubId, amount_cents: cents, kind: "topup", stripe_checkout_id: s.id,
            description: "Livestream credit top-up", created_by: p.created_by,
          });
          // 23505 = already credited (unique stripe_checkout_id): still mark it paid
          if (!error || error.code === "23505") {
            await admin.from("livestream_credit_checkouts").update({ status: "paid" }).eq("stripe_checkout_id", s.id);
            if (!error) credited += cents;
          }
        } else if (s.status === "expired") {
          await admin.from("livestream_credit_checkouts").update({ status: "expired" }).eq("stripe_checkout_id", s.id);
        }
      }
      const { data: balance } = await admin.rpc("livestream_credit_balance", { p_club: clubId });
      return json({ credited, balanceCents: balance ?? 0 });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[livestream-credit]", err);
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
});
