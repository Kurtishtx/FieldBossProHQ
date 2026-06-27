import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Find the platform account for a Stripe event (prefer metadata.user_id, fall back to customer id).
async function findAccount(userId: string | undefined, customerId: string | undefined) {
  if (userId) {
    const { data } = await sb.from('platform_accounts').select('*').eq('user_id', userId).single()
    if (data) return data
  }
  if (customerId) {
    const { data } = await sb.from('platform_accounts').select('*').eq('stripe_customer_id', customerId).single()
    if (data) return data
  }
  return null
}

// Map a Stripe subscription status -> our access flags.
//   trialing / active  -> full access
//   past_due           -> still allowed (inside the 14-day grace while Stripe retries)
//   unpaid / canceled  -> LOCKED OUT, must update card to pay the overdue invoice
function flagsFor(status: string) {
  if (status === 'active' || status === 'trialing') return { active: true,  locked: false, sub_status: status }
  if (status === 'past_due')                         return { active: true,  locked: false, sub_status: status } // grace
  return { active: false, locked: true, sub_status: status } // unpaid / canceled / incomplete_expired
}

async function syncSubscription(sub: any) {
  const userId     = sub.metadata?.user_id
  const account    = await findAccount(userId, sub.customer)
  if (!account) return
  const flags = flagsFor(sub.status)
  await sb.from('platform_accounts').update({
    stripe_subscription_id: sub.id,
    stripe_customer_id:     sub.customer,
    sub_status:             flags.sub_status,
    active:                 flags.active,
    locked:                 flags.locked,
    monthly_amount:         199,
    plan:                   'Monthly Subscription',
    // billing_day stays the ORIGINAL cycle date; late payments never move it
    billing_day:            new Date(sub.current_period_end * 1000).getDate(),
  }).eq('user_id', account.user_id)
}

Deno.serve(async (req) => {
  const sig  = req.headers.get('stripe-signature')
  const body = await req.text()
  let event: any
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET, undefined, cryptoProvider)
  } catch (e: any) {
    return new Response('Bad signature: ' + e.message, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string)
          if (!sub.metadata?.user_id && (s.metadata?.user_id || s.client_reference_id)) {
            sub.metadata = { ...sub.metadata, user_id: s.metadata?.user_id || s.client_reference_id }
          }
          await syncSubscription(sub)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object)
        break
      }

      // Record each successful payment as a platform invoice (your billing history)
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const inv = event.data.object
        const account = await findAccount(inv.subscription_details?.metadata?.user_id, inv.customer)
        if (account && inv.amount_paid > 0) {
          const { data: allInvs } = await sb.from('platform_invoices').select('inv_num')
          const nums = (allInvs || []).map((r: any) => parseInt(r.inv_num)).filter((n: number) => !isNaN(n))
          const nextNum = nums.length ? Math.max(...nums) + 1 : 1
          const todayStr = new Date().toISOString().split('T')[0]
          const amt = inv.amount_paid / 100
          await sb.from('platform_invoices').insert({
            account_email:   account.email || '',
            account_user_id: account.user_id,
            date:            todayStr,
            inv_num:         String(nextNum),
            inv_total:       amt,
            inv_bal:         0,
            payment:         'Card on file',
            status_text:     'sent',
            failed_charge:   false,
            deleted:         false,
            service_lines:   [{ name: 'Monthly Subscription', description: 'IndustryBossPro', date: todayStr, rate: amt, qty: 1, amount: amt }],
          })
          // clearing any past-due state happens via the subscription.updated event Stripe also sends
        }
        break
      }

      case 'invoice.payment_failed': {
        // Stripe moves the subscription to past_due and starts the retry window (your 14-day
        // grace, set in Stripe billing settings). The subscription.updated event handles flags.
        const inv = event.data.object
        const account = await findAccount(inv.subscription_details?.metadata?.user_id, inv.customer)
        if (account) {
          await sb.from('platform_accounts').update({ sub_status: 'past_due' }).eq('user_id', account.user_id)
        }
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response('Handler error: ' + e.message, { status: 500 })
  }
})
