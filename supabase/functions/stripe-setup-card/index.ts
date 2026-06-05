import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const { action, estimate_id, payment_method_id, stripe_customer_id } = body;

    /* ── ACTION: create_setup_intent ── */
    if (!action || action === "create_setup_intent") {
      if (!estimate_id) return new Response(JSON.stringify({ error: "Missing estimate_id" }), { status: 400, headers: CORS });

      // Load estimate to get customer info and user_id
      const { data: est } = await supabase.from("estimates").select("*").eq("id", estimate_id).single();
      if (!est) return new Response(JSON.stringify({ error: "Estimate not found" }), { status: 404, headers: CORS });

      // Load company Stripe secret key for this user
      const { data: co } = await supabase
        .from("company_info")
        .select("stripe_secret_key")
        .eq("user_id", est.user_id)
        .single();

      const secretKey = co?.stripe_secret_key;
      if (!secretKey) {
        return new Response(
          JSON.stringify({ error: "Stripe not configured. Add your Stripe secret key in Company Info → Payments." }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Load client to check for existing Stripe customer
      let stripeCustomerId = stripe_customer_id || null;
      let clientData: any = null;
      if (est.customer_id) {
        const { data: cl } = await supabase.from("Clients").select("id, name, stripe_customer_id").eq("id", est.customer_id).single();
        clientData = cl;
        stripeCustomerId = stripeCustomerId || cl?.stripe_customer_id || null;
      }

      // Create Stripe customer if none exists
      if (!stripeCustomerId) {
        const clientName = clientData?.name || est.client_name || "";
        const customer = await stripePost(secretKey, "/customers", {
          name: clientName,
          ...(est.customer_id ? { "metadata[client_id]": est.customer_id } : {}),
        });
        if (customer.error) throw new Error(customer.error.message);
        stripeCustomerId = customer.id;

        // Save customer ID to client profile
        if (est.customer_id) {
          await supabase.from("Clients").update({ stripe_customer_id: stripeCustomerId }).eq("id", est.customer_id);
        }
      }

      // Create SetupIntent
      const setup = await stripePost(secretKey, "/setup_intents", {
        customer: stripeCustomerId,
        usage: "off_session",
        "payment_method_types[]": "card",
      });
      if (setup.error) throw new Error(setup.error.message);

      return new Response(
        JSON.stringify({ client_secret: setup.client_secret, stripe_customer_id: stripeCustomerId }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    /* ── ACTION: save_card ── */
    if (action === "save_card") {
      if (!payment_method_id || !body.customer_id) {
        return new Response(JSON.stringify({ error: "Missing payment_method_id or customer_id" }), { status: 400, headers: CORS });
      }

      // Load Stripe key for this user
      const { data: co2 } = await supabase.from("company_info").select("stripe_secret_key").eq("user_id", body.user_id).single();
      const secretKey = co2?.stripe_secret_key;
      if (!secretKey) return new Response(JSON.stringify({ error: "Stripe not configured." }), { status: 400, headers: CORS });

      // Get card details from Stripe
      const pm = await stripeGet(secretKey, "/payment_methods/" + payment_method_id);
      if (pm.error) throw new Error(pm.error.message);
      const card = pm.card;

      // Set as default payment method on the Stripe customer
      if (stripe_customer_id) {
        await stripePost(secretKey, "/customers/" + stripe_customer_id, {
          "invoice_settings[default_payment_method]": payment_method_id,
        });
      }

      // Save card details to client profile in Supabase
      await supabase.from("Clients").update({
        stripe_customer_id: stripe_customer_id || pm.customer,
        card_last4:         card.last4,
        card_brand:         card.brand,
        card_exp_month:     String(card.exp_month),
        card_exp_year:      String(card.exp_year),
      }).eq("id", body.customer_id);

      return new Response(
        JSON.stringify({ ok: true, last4: card.last4, brand: card.brand }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
