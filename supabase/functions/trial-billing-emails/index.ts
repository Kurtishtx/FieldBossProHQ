import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = 're_apd6qCQb_LerK8x5aS84YU4J7jj6WarnM'
const BILLING_URL   = 'https://my.spraybosspro.com/billing-setup.html'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const CORS = { 'Access-Control-Allow-Origin': '*' }

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SprayBossPro <mail@spraybosspro.com>',
      to: [to],
      subject,
      html,
    }),
  })
  return res.json()
}

function emailTemplate(headline: string, body: string, urgency: 'normal' | 'warn' | 'danger') {
  const accent = urgency === 'danger' ? '#c0392b' : urgency === 'warn' ? '#e07820' : '#130520'
  const btn    = 'display:inline-block;background:#e07820;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:700;font-size:15px;letter-spacing:.2px;'
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
      <div style="background:#130520;padding:20px 32px;">
        <span style="color:#fff;font-size:18px;font-weight:900;letter-spacing:-.3px;">SprayBoss<span style="color:#e07820;">Pro</span></span>
      </div>
      <div style="padding:32px 32px 24px;">
        <h2 style="font-size:22px;font-weight:800;color:${accent};margin:0 0 16px;">${headline}</h2>
        ${body}
        <p style="margin:24px 0 0;"><a href="${BILLING_URL}" style="${btn}">Add Payment Info →</a></p>
      </div>
      <div style="background:#f5f5f5;padding:14px 32px;font-size:12px;color:#999;">
        SprayBossPro &middot; $129/month &middot; Cancel anytime &middot; All your data is saved
      </div>
    </div>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Only accounts that haven't added a card yet
  const { data: accounts, error } = await sb
    .from('platform_accounts')
    .select('*')
    .eq('active', false)
    .not('trial_ends_at', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }

  let sent = 0

  for (const acct of (accounts || [])) {
    const trialEnd = new Date(acct.trial_ends_at)
    trialEnd.setHours(0, 0, 0, 0)
    const daysLeft = Math.round((trialEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const endDateStr = trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    if (daysLeft === 2 && !acct.email_sent_2day) {
      await sendEmail(
        acct.email,
        'Your SprayBossPro trial ends in 2 days',
        emailTemplate(
          'Your trial ends in 2 days',
          `<p style="color:#444;line-height:1.6;margin:0 0 12px;">Your 14-day free trial ends on <strong>${endDateStr}</strong>.</p>
           <p style="color:#444;line-height:1.6;margin:0;">Add your card now to keep uninterrupted access — $129/month, cancel anytime.</p>`,
          'normal'
        )
      )
      await sb.from('platform_accounts').update({ email_sent_2day: true }).eq('id', acct.id)
      sent++

    } else if (daysLeft === 1 && !acct.email_sent_1day) {
      await sendEmail(
        acct.email,
        'Last day of your SprayBossPro trial — add your card today',
        emailTemplate(
          'Your trial ends tomorrow',
          `<p style="color:#444;line-height:1.6;margin:0 0 12px;">Tomorrow your account will be paused until payment info is added.</p>
           <p style="color:#444;line-height:1.6;margin:0;">Takes less than a minute. All your data stays right where it is.</p>`,
          'warn'
        )
      )
      await sb.from('platform_accounts').update({ email_sent_1day: true }).eq('id', acct.id)
      sent++

    } else if (daysLeft <= 0 && !acct.email_sent_paused) {
      await sendEmail(
        acct.email,
        'Your SprayBossPro account has been paused',
        emailTemplate(
          'Your account is paused',
          `<p style="color:#444;line-height:1.6;margin:0 0 12px;">Your free trial has ended. Your account is paused but all your data is saved.</p>
           <p style="color:#444;line-height:1.6;margin:0;">Add your card below to reactivate immediately — $129/month, cancel anytime.</p>`,
          'danger'
        )
      )
      await sb.from('platform_accounts').update({ email_sent_paused: true, paused: true }).eq('id', acct.id)
      sent++
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
})
