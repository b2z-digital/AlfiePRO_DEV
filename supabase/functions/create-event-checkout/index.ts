import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

    if (!stripeSecretKey) {
      throw new Error("Stripe is not configured. Please add your Stripe secret key.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const {
      registration_id,
      event_id,
      club_id,
      amount,
      currency = "aud",
      success_url,
      cancel_url,
    } = await req.json();

    // Validate required fields
    if (!registration_id || !event_id || !club_id || !amount) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: registration_id, event_id, club_id, amount",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get club details to fetch Stripe account
    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("id, name, stripe_account_id")
      .eq("id", club_id)
      .single();

    if (clubError || !club) {
      return new Response(
        JSON.stringify({ error: "Club not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!club.stripe_account_id) {
      return new Response(
        JSON.stringify({
          error: "Club has not connected Stripe. Please contact the club administrator.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from("quick_races")
      .select("event_name, race_date")
      .eq("id", event_id)
      .maybeSingle();

    // If not found in quick_races, try public_events
    let eventName = "Event Registration";
    if (!event) {
      const { data: publicEvent } = await supabase
        .from("public_events")
        .select("event_name")
        .eq("id", event_id)
        .maybeSingle();

      if (publicEvent) {
        eventName = publicEvent.event_name;
      }
    } else {
      eventName = event.event_name || "Event Registration";
    }

    // Get registration details
    const { data: registration, error: regError } = await supabase
      .from("event_registrations")
      .select("*")
      .eq("id", registration_id)
      .single();

    if (regError || !registration) {
      return new Response(
        JSON.stringify({ error: "Registration not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine participant name for receipt
    let participantName = "Participant";
    if (registration.registration_type === "member" && registration.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", registration.user_id)
        .maybeSingle();

      if (profile) {
        participantName = `${profile.first_name} ${profile.last_name}`;
      }
    } else if (registration.guest_first_name && registration.guest_last_name) {
      participantName = `${registration.guest_first_name} ${registration.guest_last_name}`;
    }

    // Calculate application fee (2.5% platform fee)
    const applicationFeeAmount = Math.round(amount * 0.025 * 100);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: Math.round(amount * 100), // Convert to cents
              product_data: {
                name: eventName,
                description: `Event entry fee for ${participantName}${registration.boat_name ? ` - ${registration.boat_name}` : ""}${registration.sail_number ? ` (Sail #${registration.sail_number})` : ""}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: registration.guest_email || undefined,
        success_url: success_url || `${req.headers.get("origin")}/events/${event_id}?payment=success`,
        cancel_url: cancel_url || `${req.headers.get("origin")}/events/${event_id}?payment=cancelled`,
        metadata: {
          registration_id,
          event_id,
          club_id,
          participant_name: participantName,
          boat_name: registration.boat_name || "",
          sail_number: registration.sail_number || "",
        },
        payment_intent_data: {
          application_fee_amount: applicationFeeAmount,
          metadata: {
            registration_id,
            event_id,
            club_id,
          },
        },
      },
      {
        stripeAccount: club.stripe_account_id,
      }
    );

    // Update registration with checkout session ID
    await supabase
      .from("event_registrations")
      .update({
        stripe_checkout_session_id: session.id,
        payment_status: "unpaid",
      })
      .eq("id", registration_id);

    return new Response(
      JSON.stringify({
        session_id: session.id,
        url: session.url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to create checkout session",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
