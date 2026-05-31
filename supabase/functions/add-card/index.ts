import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const STRIPE_SECRET_KEY = "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";
const SUPABASE_URL      = "https://knjdbgroiyhvqwrpqzcx.supabase.co";
const SUPABASE_KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuamRiZ3JvaXlodnF3cnBxemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTczMDMsImV4cCI6MjA5NTA3MzMwM30.zoExtkem-XZqU86S4yJjA_xOOaS1G0IPU2M9OAAza2g";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function stripePost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params).toString();
  return fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }).then((r) => r.json());
}

function stripeGet(path: string) {
  return fetch("https://api.stripe.com/v1" + path, {
    headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY },
  }).then((r) => r.json());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();

    /* ── DELETE: remove card from Stripe (best-effort) ── */
    if (req.method === "DELETE") {
      const { stripeCustomerId } = body;
      if (stripeCustomerId) {
        const customer = await stripeGet("/customers/" + stripeCustomerId + "?expand[]=sources");
        const pmList = await fetch(
          "https://api.stripe.com/v1/payment_methods?customer=" + stripeCustomerId + "&type=card",
          { headers: { Authorization: "Bearer " + STRIPE_SECRET_KEY } }
        ).then((r) => r.json());
        for (const pm of (pmList.data || [])) {
          await stripePost("/payment_methods/" + pm.id + "/detach", {});
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    /* ── POST: attach card to Stripe customer ── */
    const { paymentMethodId, stripeCustomerId, name, zip, clientId } = body;

    // Create customer if none exists
    let customerId = stripeCustomerId;
    if (!customerId) {
      const customer = await stripePost("/customers", { name, "metadata[client_id]": clientId });
      if (customer.error) throw new Error(customer.error.message);
      customerId = customer.id;
    }

    // Attach payment method
    const attach = await stripePost("/payment_methods/" + paymentMethodId + "/attach", {
      customer: customerId,
    });
    if (attach.error) throw new Error(attach.error.message);

    // Set as default payment method
    await stripePost("/customers/" + customerId, {
      "invoice_settings[default_payment_method]": paymentMethodId,
    });

    // Get card details
    const pm = await stripeGet("/payment_methods/" + paymentMethodId);
    const card = pm.card;

    return new Response(
      JSON.stringify({
        stripeCustomerId: customerId,
        last4:     card.last4,
        expMonth:  card.exp_month,
        expYear:   card.exp_year,
        brand:     card.brand,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
