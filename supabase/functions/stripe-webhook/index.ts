/*
  # Stripe Webhook Handler Edge Function

  Handles Stripe webhook events for membership payments.
  Processes checkout session completion and updates member records.
  Creates finance transactions for integrated tracking.
*/

import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@12.4.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''

const STRIPE_RATE = 0.0175;
const STRIPE_FIXED_FEE = 0.30;

function calculateStripeFee(amount: number): number {
  return Math.round((amount * STRIPE_RATE + STRIPE_FIXED_FEE) * 100) / 100;
}

function calculateTaxAmount(amount: number, taxRate: number): {
  taxAmount: number;
  baseAmount: number;
} {
  const taxAmount = Math.round((amount * taxRate / (1 + taxRate)) * 100) / 100;
  const baseAmount = amount - taxAmount;
  return { taxAmount, baseAmount };
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.text()
    let event

    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
    } catch (err) {
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object

        const { club_id, membership_type_id, user_id } = session.metadata

        if (!club_id || !membership_type_id || !user_id) {
          console.error('Missing metadata in session', session.metadata)
          return new Response(JSON.stringify({ error: 'Missing metadata' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const { data: membershipType, error: membershipTypeError } = await supabaseAdmin
          .from('membership_types')
          .select('*')
          .eq('id', membership_type_id)
          .single()

        if (membershipTypeError || !membershipType) {
          console.error('Membership type not found', membershipTypeError)
          return new Response(JSON.stringify({ error: 'Membership type not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const { data: club, error: clubError } = await supabaseAdmin
          .from('clubs')
          .select('renewal_mode, fixed_renewal_date, tax_enabled, tax_rate, tax_name, default_membership_category_id')
          .eq('id', club_id)
          .single()

        if (clubError) {
          console.error('Error fetching club', clubError)
          return new Response(JSON.stringify({ error: 'Error fetching club' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const { data: member, error: memberError } = await supabaseAdmin
          .from('members')
          .select('*')
          .eq('user_id', user_id)
          .eq('club_id', club_id)
          .maybeSingle()

        if (memberError && memberError.code !== 'PGRST116') {
          console.error('Error fetching member', memberError)
          return new Response(JSON.stringify({ error: 'Error fetching member' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const today = new Date()
        let expiryDate = new Date(today)

        if (club.renewal_mode === 'fixed' && club.fixed_renewal_date) {
          const [month, day] = club.fixed_renewal_date.split('-').map(Number)
          expiryDate = new Date(today.getFullYear(), month - 1, day)
          if (expiryDate < today) {
            expiryDate = new Date(today.getFullYear() + 1, month - 1, day)
          }
        } else {
          switch (membershipType.renewal_period) {
            case 'monthly':
              expiryDate.setMonth(today.getMonth() + 1)
              break
            case 'quarterly':
              expiryDate.setMonth(today.getMonth() + 3)
              break
            case 'annual':
            default:
              expiryDate.setFullYear(today.getFullYear() + 1)
              break
          }
        }

        if (member) {
          const { error: updateError } = await supabaseAdmin
            .from('members')
            .update({
              is_financial: true,
              payment_status: 'paid',
              payment_confirmed_at: new Date().toISOString(),
              payment_method: 'credit_card',
              renewal_date: expiryDate.toISOString().split('T')[0],
            })
            .eq('id', member.id)

          if (updateError) {
            console.error('Error updating member', updateError)
            return new Response(JSON.stringify({ error: 'Error updating member' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const { error: renewalError } = await supabaseAdmin
            .from('membership_renewals')
            .insert({
              member_id: member.id,
              membership_type_id,
              renewal_date: today.toISOString().split('T')[0],
              expiry_date: expiryDate.toISOString().split('T')[0],
              amount_paid: membershipType.amount,
              payment_method: 'stripe',
              payment_reference: session.payment_intent,
            })

          if (renewalError) {
            console.error('Error creating renewal record', renewalError)
          }

          // CREATE FINANCE TRANSACTION
          const amount = parseFloat(membershipType.amount);
          let taxAmount = 0;
          let baseAmount = amount;

          if (club.tax_enabled && club.tax_rate) {
            const taxCalc = calculateTaxAmount(amount, club.tax_rate);
            taxAmount = taxCalc.taxAmount;
            baseAmount = taxCalc.baseAmount;
          }

          const stripeFee = calculateStripeFee(amount);
          const netAmount = amount - stripeFee;

          const transactionData = {
            club_id: club_id,
            type: 'deposit',
            category_id: club.default_membership_category_id,
            description: `Membership: ${member.first_name} ${member.last_name} - ${membershipType.name}`,
            amount: amount,
            tax_amount: taxAmount,
            net_amount: netAmount,
            date: today.toISOString().split('T')[0],
            payment_method: 'credit_card',
            payment_status: 'completed',
            payment_gateway: 'stripe',
            gateway_transaction_id: session.payment_intent as string,
            gateway_fee: stripeFee,
            linked_entity_type: 'membership',
            linked_entity_id: member.id,
            payer: `${member.first_name} ${member.last_name}`,
            reference: member.id,
          };

          const { data: transaction, error: transactionError } = await supabaseAdmin
            .from('transactions')
            .insert(transactionData)
            .select()
            .single();

          if (transactionError) {
            console.error('Error creating transaction', transactionError);
          } else {
            // Create membership_transaction link
            await supabaseAdmin
              .from('membership_transactions')
              .insert({
                club_id: club_id,
                member_id: member.id,
                transaction_id: transaction.id,
                membership_type_id: membership_type_id,
                amount: baseAmount,
                tax_amount: taxAmount,
                total_amount: amount,
                payment_method: 'credit_card',
                payment_status: 'paid',
                stripe_payment_intent_id: session.payment_intent as string,
                stripe_fee: stripeFee,
              });
          }
        }

        const { error: paymentError } = await supabaseAdmin
          .from('membership_payments')
          .insert({
            member_id: member?.id,
            membership_type_id,
            amount: membershipType.amount,
            currency: membershipType.currency,
            status: 'completed',
            payment_method: 'stripe',
            stripe_payment_intent_id: session.payment_intent,
            stripe_customer_id: session.customer,
          })

        if (paymentError) {
          console.error('Error creating payment record', paymentError)
        }

        break
      }

      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`)
    return new Response(JSON.stringify({ error: `Webhook error: ${err.message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
