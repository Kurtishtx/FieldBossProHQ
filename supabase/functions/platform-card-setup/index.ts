import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function stripePost(path: string, params: Record<string, string>) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')!
  return fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secretKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  }).then(r => r.json())
}

function stripeGet(path: string) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')!
  return fetch('https://api.stripe.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + secretKey },
  }).then(r => r.json())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { action, user_id, payment_method_id } = await req.json()

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: CORS })
    }

    const { data: acct } = await sb
      .from('platform_accounts')
      .select('*')
      .eq('user_id', user_id)
      .single()

    // ── create_payment_intent: charge $199 now and save card for future ──
    if (!action || action === 'create_payment_intent') {
      let customerId = acct?.stripe_customer_id

      if (!customerId) {
        const customer = await stripePost('/customers', {
          email: acct?.email || '',
          'metadata[user_id]': user_id,
        })
        if (customer.error) throw new Error(customer.error.message)
        customerId = customer.id
        await sb.from('platform_accounts')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', user_id)
      }

      // PaymentIntent charges immediately and saves card for future monthly charges
      const payment = await stripePost('/payment_intents', {
        amount: '19900',
        currency: 'usd',
        customer: customerId,
        setup_future_usage: 'off_session',
        'payment_method_types[]': 'card',
        description: 'IndustryBossPro Monthly Subscription',
        'metadata[user_id]': user_id,
      })
      if (payment.error) throw new Error(payment.error.message)

      return new Response(
        JSON.stringify({ client_secret: payment.client_secret, stripe_customer_id: customerId }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── save_card: called after Stripe.js confirms payment ──
    if (action === 'save_card') {
      if (!payment_method_id) {
        return new Response(JSON.stringify({ error: 'Missing payment_method_id' }), { status: 400, headers: CORS })
      }

      const pm = await stripeGet('/payment_methods/' + payment_method_id)
      if (pm.error) throw new Error(pm.error.message)

      const customerId = acct?.stripe_customer_id
      if (customerId) {
        await stripePost('/customers/' + customerId, {
          'invoice_settings[default_payment_method]': payment_method_id,
        })
      }

      const card       = pm.card
      const today      = new Date()
      const todayStr   = today.toISOString().split('T')[0]
      const billingDay = today.getDate()

      await sb.from('platform_accounts').update({
        card_last4:     card.last4,
        card_brand:     card.brand,
        card_added_at:  todayStr,
        billing_day:    billingDay,
        monthly_amount: 199,
        plan:           'Monthly Subscription',
        active:         true,
        paused:         false,
      }).eq('user_id', user_id)

      // Get next invoice number
      const { data: allInvs } = await sb.from('platform_invoices').select('inv_num')
      const maxNum = (allInvs || []).map((r: any) => parseInt(r.inv_num)).filter((n: number) => !isNaN(n) && n > 0)
      const nextNum = maxNum.length ? Math.max(...maxNum) + 1 : 1

      // Create a paid invoice for this charge
      await sb.from('platform_invoices').insert({
        account_email:   acct?.email || '',
        account_user_id: user_id,
        date:            todayStr,
        inv_num:         String(nextNum),
        inv_total:       199,
        inv_bal:         0,
        payment:         `${card.brand} ****${card.last4}`,
        status_text:     'sent',
        failed_charge:   false,
        deleted:         false,
        service_lines:   [{ name: 'Monthly Subscription', description: 'IndustryBossPro — first month', date: todayStr, rate: 199, qty: 1, amount: 199 }],
      })

      return new Response(
        JSON.stringify({ ok: true, last4: card.last4, brand: card.brand, billing_day: billingDay }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS })

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
