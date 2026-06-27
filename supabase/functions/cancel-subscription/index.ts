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

// Admin action: cancel a client's Stripe subscription (stops billing) and mark the account off.
// Cancels IMMEDIATELY. To instead let them finish the paid period, change the DELETE below to a
// POST with body 'cancel_at_period_end=true' (Content-Type x-www-form-urlencoded).
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

    const subId = acct?.stripe_subscription_id
    if (subId) {
      const secretKey = Deno.env.get('STRIPE_SECRET_KEY')!
      const res = await fetch('https://api.stripe.com/v1/subscriptions/' + subId, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + secretKey },
      }).then(r => r.json())
      // ignore "already canceled / not found" so the button is idempotent
      if (res.error && !/no such subscription|already been canceled|already canceled/i.test(res.error.message || '')) {
        throw new Error(res.error.message)
      }
    }

    // Mark the account stopped (the customer.subscription.deleted webhook also syncs this)
    await sb.from('platform_accounts').update({
      active: false,
      locked: true,
      sub_status: 'canceled',
    }).eq('user_id', user_id)

    return new Response(JSON.stringify({ ok: true, had_subscription: !!subId }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: CORS })
  }
})
