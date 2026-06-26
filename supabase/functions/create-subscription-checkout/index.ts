import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── IndustryBossPro $199/month price. Swap this for your TEST-mode price_... when testing. ──
const PRICE_ID = 'price_1TmjFtE12pIruePYrNy9ywOm'
const BASE_URL = 'https://my.industrybosspro.com'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { user_id } = await req.json()
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: CORS })
    }

    const { data: acct } = await sb
      .from('platform_accounts')
      .select('*')
      .eq('user_id', user_id)
      .single()

    // Reuse or create the Stripe customer for this account
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

    // Create a Checkout Session in subscription mode.
    // The 14-day free trial already happened in-app (no card), so this runs at trial-end:
    // Stripe charges the first $199 immediately, then auto-charges every month on that same
    // cycle date. Declines are retried over your 10-day grace window (set in billing settings),
    // and the cycle date never shifts because a late-paid sub is marked unpaid, not canceled.
    const session = await stripePost('/checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': PRICE_ID,
      'line_items[0][quantity]': '1',
      success_url: BASE_URL + '/dashboard.html?subscribed=1',
      cancel_url: BASE_URL + '/billing-setup.html?canceled=1',
      'metadata[user_id]': user_id,
      'subscription_data[metadata][user_id]': user_id,
      client_reference_id: user_id,
      allow_promotion_codes: 'true',
    })
    if (session.error) throw new Error(session.error.message)

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: CORS })
  }
})
