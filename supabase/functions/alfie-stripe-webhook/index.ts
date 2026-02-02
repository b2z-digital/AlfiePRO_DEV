import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14.10.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

    if (!stripeKey) {
      console.error('Stripe not configured')
      return new Response('Stripe not configured', {
        status: 400,
        headers: corsHeaders
      })
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    })

    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      console.error('No Stripe signature found')
      return new Response('No signature', {
        status: 400,
        headers: corsHeaders
      })
    }

    let event: Stripe.Event

    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      } catch (err) {
        console.error('Webhook signature verification failed:', err)
        return new Response('Invalid signature', {
          status: 400,
          headers: corsHeaders
        })
      }
    } else {
      console.warn('No webhook secret configured, skipping signature verification')
      event = JSON.parse(body)
    }

    console.log('Processing Stripe event:', event.type, event.id)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout session completed:', session.id)

        const userId = session.metadata?.user_id
        const clubId = session.metadata?.club_id
        const subscriptionType = session.metadata?.subscription_type

        if (!userId || !clubId || !subscriptionType) {
          console.error('Missing required metadata:', { userId, clubId, subscriptionType })
          break
        }

        let trialEnd = null
        let status = 'active'
        let currentPeriodEnd = null

        if (session.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription as string
            )

            if (subscription.trial_end) {
              trialEnd = new Date(subscription.trial_end * 1000).toISOString()
              status = 'trialing'
            }

            if (subscription.current_period_end) {
              currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString()
            }
          } catch (err) {
            console.error('Error retrieving subscription:', err)
          }
        }

        const { error: updateError } = await supabaseClient
          .from('user_subscriptions')
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: status,
            trial_end_date: trialEnd,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('club_id', clubId)

        if (updateError) {
          console.error('Error updating subscription:', updateError)
        } else {
          console.log('Successfully updated subscription for user:', userId)
        }

        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription updated:', subscription.id)

        const userId = subscription.metadata?.user_id
        const clubId = subscription.metadata?.club_id

        if (!userId || !clubId) {
          console.error('Missing metadata in subscription')
          break
        }

        let status: string = subscription.status
        if (status === 'trialing') {
          status = 'trialing'
        } else if (status === 'active') {
          status = 'active'
        } else if (status === 'past_due') {
          status = 'past_due'
        } else if (status === 'canceled' || status === 'unpaid') {
          status = 'cancelled'
        }

        const updateData: any = {
          status: status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString()
        }

        if (subscription.trial_end) {
          updateData.trial_end_date = new Date(subscription.trial_end * 1000).toISOString()
        }

        const { error: updateError } = await supabaseClient
          .from('user_subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id)

        if (updateError) {
          console.error('Error updating subscription:', updateError)
        } else {
          console.log('Successfully updated subscription status:', status)
        }

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription deleted:', subscription.id)

        const { error: updateError } = await supabaseClient
          .from('user_subscriptions')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id)

        if (updateError) {
          console.error('Error cancelling subscription:', updateError)
        } else {
          console.log('Successfully cancelled subscription')
        }

        break
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Trial ending soon for subscription:', subscription.id)

        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Payment succeeded for invoice:', invoice.id)

        if (invoice.subscription) {
          const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .update({
              status: 'active',
              updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', invoice.subscription as string)

          if (updateError) {
            console.error('Error updating subscription after payment:', updateError)
          }
        }

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Payment failed for invoice:', invoice.id)

        if (invoice.subscription) {
          const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', invoice.subscription as string)

          if (updateError) {
            console.error('Error updating subscription after failed payment:', updateError)
          }
        }

        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in webhook handler:', error)

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
