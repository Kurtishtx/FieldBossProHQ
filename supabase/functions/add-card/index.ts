import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function stripePost(secretKey: string, path: string, params: Record<string, string>) {
  return fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secretKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  }).then((r) => r.json());
}

function stripeGet(secretKey: string, path: string) {
  return fetch("https://api.stripe.com/v1" + path, {
    headers: { Authorization: "Bearer " + secretKey },
  }).then((r) => r.json());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();

    // Load company Stripe secret key
    const { data: co } = await supabase
      .from("company_info")
      .select("stripe_secret_key")
      .limit(1)
      .single();

    const secretKey = co?.stripe_secret_key;
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured. Add your Stripe secret key in Company Info → Payments." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    /* ── DELETE: remove card from Stripe ── */
    if (req.method === "DELETE") {
      const { stripeCustomerId } = body;
      if (stripeCustomerId) {
        const pmList = await fetch(
          "https://api.stripe.com/v1/payment_methods?customer=" + stripeCustomerId + "&type=card",
          { headers: { Authorization: "Bearer " + secretKey } }
        ).then((r) => r.json());
        for (const pm of (pmList.data || [])) {
          await stripePost(secretKey, "/payment_methods/" + pm.id + "/detach", {});
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    /* ── POST: attach card to Stripe customer ── */
    const { paymentMethodId, stripeCustomerId, name, zip, clientId } = body;

    let customerId = stripeCustomerId;
    if (!customerId) {
      const customer = await stripePost(secretKey, "/customers", { name, "metadata[client_id]": clientId });
      if (customer.error) throw new Error(customer.error.message);
      customerId = customer.id;
    }

    const attach = await stripePost(secretKey, "/payment_methods/" + paymentMethodId + "/attach", {
      customer: customerId,
    });
    if (attach.error) throw new Error(attach.error.message);

    await stripePost(secretKey, "/customers/" + customerId, {
      "invoice_settings[default_payment_method]": paymentMethodId,
    });

    const pm = await stripeGet(secretKey, "/payment_methods/" + paymentMethodId);
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
