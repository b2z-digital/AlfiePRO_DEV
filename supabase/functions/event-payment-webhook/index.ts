import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_EVENTS");

    if (!stripeSecretKey || !webhookSecret) {
      throw new Error("Stripe is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "No signature provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(
        JSON.stringify({ error: "Webhook signature verification failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing event: ${event.type}`);

    // Get the connected account ID if this is a Connect event
    const connectedAccountId = (event as any).account;
    console.log(`Connected account: ${connectedAccountId || 'platform account'}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { registration_id, event_id, club_id } = session.metadata || {};

        if (!registration_id || !event_id || !club_id) {
          console.error("Missing metadata in session");
          break;
        }

        // Verify this club owns this connected account
        if (connectedAccountId) {
          const { data: club } = await supabase
            .from("clubs")
            .select("stripe_account_id")
            .eq("id", club_id)
            .maybeSingle();

          if (club?.stripe_account_id !== connectedAccountId) {
            console.error("Connected account mismatch");
            break;
          }
        }

        // Update registration status
        const { error: updateError } = await supabase
          .from("event_registrations")
          .update({
            payment_status: "paid",
            status: "confirmed",
            amount_paid: (session.amount_total || 0) / 100,
            stripe_payment_id: session.payment_intent as string,
            updated_at: new Date().toISOString(),
          })
          .eq("id", registration_id);

        if (updateError) {
          console.error("Error updating registration:", updateError);
          break;
        }

        console.log(`Successfully updated registration ${registration_id} to paid status`);

        // Create payment transaction record
        const { error: transactionError } = await supabase
          .from("event_payment_transactions")
          .insert({
            registration_id,
            club_id,
            amount: (session.amount_total || 0) / 100,
            currency: session.currency?.toUpperCase() || "AUD",
            payment_method: "stripe",
            payment_status: "completed",
            stripe_payment_intent_id: session.payment_intent as string,
            transaction_date: new Date().toISOString(),
            notes: "Payment completed via Stripe Checkout",
          });

        if (transactionError) {
          console.error("Error creating transaction:", transactionError);
        }

        console.log(`Payment completed for registration ${registration_id}`);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { registration_id } = session.metadata || {};

        if (registration_id) {
          await supabase
            .from("event_registrations")
            .update({ payment_status: "unpaid" })
            .eq("id", registration_id);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { registration_id } = paymentIntent.metadata || {};

        if (registration_id) {
          await supabase
            .from("event_registrations")
            .update({ payment_status: "unpaid" })
            .eq("id", registration_id);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;

        // Find registration by payment intent
        const { data: registration } = await supabase
          .from("event_registrations")
          .select("id, club_id")
          .eq("stripe_payment_id", paymentIntentId)
          .maybeSingle();

        if (registration) {
          // Update registration status
          await supabase
            .from("event_registrations")
            .update({ payment_status: "refunded" })
            .eq("id", registration.id);

          // Create refund transaction record
          await supabase
            .from("event_payment_transactions")
            .insert({
              registration_id: registration.id,
              club_id: registration.club_id,
              amount: -(charge.amount_refunded / 100),
              currency: charge.currency.toUpperCase(),
              payment_method: "stripe",
              payment_status: "refunded",
              stripe_charge_id: charge.id,
              transaction_date: new Date().toISOString(),
              notes: "Refund processed",
            });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Webhook error:", error);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
