import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14.10.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CheckoutRequest {
  clubId: string
  plan: 'club' | 'state' | 'national'
  trialDays?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('User not authenticated')
    }

    const { clubId, plan, trialDays = 30 }: CheckoutRequest = await req.json()

    if (!clubId || !plan) {
      throw new Error('Missing required parameters')
    }

    // Get club details for customer name
    const { data: club } = await supabaseClient
      .from('clubs')
      .select('name')
      .eq('id', clubId)
      .single()

    // Check if Stripe is configured
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')

    if (!stripeKey) {
      console.warn('Stripe not configured, using mock checkout')

      // Store subscription intent in database with trial status
      const trialEnd = trialDays > 0
        ? Math.floor((Date.now() + trialDays * 24 * 60 * 60 * 1000) / 1000)
        : undefined;

      const { error: insertError } = await supabaseClient
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          club_id: clubId,
          subscription_type: plan,
          status: trialDays > 0 ? 'trialing' : 'active',
          trial_end_date: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
        })

      if (insertError) {
        console.error('Error storing subscription:', insertError)
      }

      // Return mock success URL
      const mockUrl = `${Deno.env.get('SUPABASE_URL')?.replace('//', '//app.')}/subscription/success?mock=true&plan=${plan}&trial=${trialDays}`

      return new Response(
        JSON.stringify({ url: mockUrl }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Real Stripe integration
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    })

    const subscriptionPricing = {
      club: {
        price: 4900, // Stripe uses cents
        priceId: Deno.env.get('STRIPE_PRICE_CLUB_ID') || 'price_club_monthly',
        name: 'Club Subscription',
        description: 'Perfect for individual yacht clubs'
      },
      state: {
        price: 14900,
        priceId: Deno.env.get('STRIPE_PRICE_STATE_ID') || 'price_state_monthly',
        name: 'State Association',
        description: 'For state-level yacht racing associations'
      },
      national: {
        price: 39900,
        priceId: Deno.env.get('STRIPE_PRICE_NATIONAL_ID') || 'price_national_monthly',
        name: 'National Association',
        description: 'For national yacht racing organizations'
      }
    }

    const selectedPlan = subscriptionPricing[plan]
    if (!selectedPlan) {
      throw new Error('Invalid subscription type')
    }

    const baseUrl = Deno.env.get('SUPABASE_URL')?.replace('https://', 'https://app.') || 'http://localhost:5173'
    const successUrl = `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/onboarding/club-setup`

    // Calculate trial end timestamp for Stripe
    const trialEndTimestamp = trialDays > 0
      ? Math.floor((Date.now() + trialDays * 24 * 60 * 60 * 1000) / 1000)
      : undefined

    // Create Stripe checkout session with trial
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: {
              name: selectedPlan.name,
              description: selectedPlan.description,
            },
            recurring: {
              interval: 'month',
            },
            unit_amount: selectedPlan.price,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
        club_id: clubId,
        subscription_type: plan,
        trial_days: trialDays.toString(),
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          club_id: clubId,
          subscription_type: plan,
        },
      },
    }

    // Add trial period if specified
    if (trialEndTimestamp) {
      sessionParams.subscription_data = {
        ...sessionParams.subscription_data,
        trial_end: trialEndTimestamp,
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    // Store subscription intent in database
    const { error: insertError } = await supabaseClient
      .from('user_subscriptions')
      .insert({
        user_id: user.id,
        club_id: clubId,
        subscription_type: plan,
        status: trialDays > 0 ? 'trialing' : 'pending',
        trial_end_date: trialEndTimestamp ? new Date(trialEndTimestamp * 1000).toISOString() : null,
      })

    if (insertError) {
      console.error('Error storing subscription intent:', insertError)
    }

    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in create-alfie-checkout:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
