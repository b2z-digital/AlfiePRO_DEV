import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { return_url } = await req.json()

    // For now, return a mock response since we don't have Stripe configured
    // In a real implementation, you would:
    // 1. Get the user's Stripe customer ID
    // 2. Create a Stripe customer portal session
    // 3. Return the portal URL

    return new Response(
      JSON.stringify({
        url: return_url || '/settings?tab=subscriptions',
        message: 'Billing portal not configured. Please contact support.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})