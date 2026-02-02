import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@12.4.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

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

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe is not configured' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    })

    const { code, state, club_id, connection_type } = await req.json()

    // Handle OAuth callback
    if (code && state) {
      console.log('Processing OAuth callback with code:', code.substring(0, 10) + '...')
      console.log('State (club_id):', state)

      const targetClubId = state
      const clientSecret = Deno.env.get('STRIPE_SECRET_KEY')

      if (!clientSecret) {
        return new Response(
          JSON.stringify({ error: 'Stripe secret key not configured' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }

      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_secret: clientSecret,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
        console.error('Failed to exchange OAuth code:', errorData)
        return new Response(
          JSON.stringify({ error: 'Failed to connect Stripe account', details: errorData }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        )
      }

      const tokenData = await tokenResponse.json()
      const stripeAccountId = tokenData.stripe_user_id

      console.log('Stripe account connected via OAuth:', stripeAccountId)

      // Store the Stripe account ID in the database
      // Fetch account details from Stripe to get business name
      const account = await stripe.accounts.retrieve(stripeAccountId)
      const accountName = account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || 'Stripe Account'

      const { error: updateError } = await supabaseClient
        .from('clubs')
        .update({
          stripe_account_id: stripeAccountId,
          stripe_account_name: accountName,
          stripe_enabled: true,
        })
        .eq('id', targetClubId)

      if (updateError) {
        console.error('Error updating club with Stripe account:', updateError)
        throw updateError
      }

      return new Response(
        JSON.stringify({
          success: true,
          account_id: stripeAccountId,
          account_name: accountName
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // For non-OAuth requests, verify club_id and admin access
    if (!club_id) {
      return new Response(
        JSON.stringify({ error: 'Club ID is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    const { data: userClub, error: userClubError } = await supabaseClient
      .from('user_clubs')
      .select('role')
      .eq('club_id', club_id)
      .eq('user_id', user.id)
      .single()

    if (userClubError || !userClub || userClub.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'You must be a club admin to connect Stripe' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      )
    }

    const { data: club, error: clubError } = await supabaseClient
      .from('clubs')
      .select('stripe_account_id')
      .eq('id', club_id)
      .single()

    if (clubError) {
      return new Response(
        JSON.stringify({ error: 'Club not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      )
    }

    const siteUrl = Deno.env.get('SITE_URL') || req.headers.get('origin') || 'http://localhost:5173'
    const clientId = Deno.env.get('STRIPE_CLIENT_ID')

    // OAuth flow for connecting existing Stripe account
    if (connection_type === 'oauth') {
      console.log('Initiating OAuth flow for existing Stripe account')

      if (!clientId) {
        return new Response(
          JSON.stringify({ error: 'Stripe OAuth is not configured' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }

      // Build OAuth URL with simplified redirect
      const redirectUri = `${siteUrl}/stripe-oauth-callback`
      const oauthUrl = new URL('https://connect.stripe.com/oauth/authorize')
      oauthUrl.searchParams.set('response_type', 'code')
      oauthUrl.searchParams.set('client_id', clientId)
      oauthUrl.searchParams.set('scope', 'read_write')
      oauthUrl.searchParams.set('redirect_uri', redirectUri)
      oauthUrl.searchParams.set('state', club_id)

      console.log('OAuth URL created:', oauthUrl.toString())

      return new Response(
        JSON.stringify({
          url: oauthUrl.toString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Express onboarding flow for new Stripe accounts
    console.log('Initiating Express onboarding flow')

    let accountId = club?.stripe_account_id

    // If no account exists, create a new one
    if (!accountId) {
      console.log('Creating new Stripe Connect Express account')

      const account = await stripe.accounts.create({
        type: 'express',
        country: 'AU',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      })

      accountId = account.id
      console.log('Created Stripe account:', accountId)

      // Store the account ID
      const { error: updateError } = await supabaseClient
        .from('clubs')
        .update({
          stripe_account_id: accountId,
        })
        .eq('id', club_id)

      if (updateError) {
        console.error('Error storing Stripe account ID:', updateError)
        throw updateError
      }
    }

    // Create account link for onboarding
    console.log('Using site URL for Stripe redirect:', siteUrl)

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/membership?tab=payment-settings`,
      return_url: `${siteUrl}/membership?tab=payment-settings&stripe_connected=true`,
      type: 'account_onboarding',
    })

    return new Response(
      JSON.stringify({
        url: accountLink.url,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in connect-stripe function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
