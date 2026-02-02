/*
  # Create Stripe Checkout Session Edge Function

  Creates a Stripe checkout session for membership payments.
  Handles membership type validation and session creation.
*/

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@12.4.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the current user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    // Get the request body
    const { membership_type_id, club_id, success_url, cancel_url } = await req.json()

    if (!membership_type_id || !club_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Get the membership type
    const { data: membershipType, error: membershipTypeError } = await supabaseClient
      .from('membership_types')
      .select('*')
      .eq('id', membership_type_id)
      .single()

    if (membershipTypeError || !membershipType) {
      return new Response(
        JSON.stringify({ error: 'Membership type not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      )
    }

    // Get the club
    const { data: club, error: clubError } = await supabaseClient
      .from('clubs')
      .select('*')
      .eq('id', club_id)
      .single()

    if (clubError || !club) {
      return new Response(
        JSON.stringify({ error: 'Club not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      )
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    // Create a Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: membershipType.currency.toLowerCase(),
            product_data: {
              name: `${club.name} - ${membershipType.name}`,
              description: membershipType.description || `Membership for ${club.name}`,
            },
            unit_amount: Math.round(membershipType.amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success_url || `${Deno.env.get('SITE_URL')}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${Deno.env.get('SITE_URL')}/membership/${club_id}`,
      client_reference_id: user.id,
      metadata: {
        club_id,
        membership_type_id,
        user_id: user.id,
      },
    })

    return new Response(
      JSON.stringify({ id: session.id, url: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})