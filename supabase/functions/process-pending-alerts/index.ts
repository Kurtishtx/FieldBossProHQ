import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: any[] = [];

    // ── 1. Process time-gated service/estimate alerts ──────────────────────
    const { data: pending, error: fetchErr } = await supabase
      .from("pending_sms_alerts")
      .select("*")
      .eq("sent", false)
      .lte("send_at", new Date().toISOString());

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    for (const alert of (pending ?? [])) {
      await supabase.from("pending_sms_alerts").update({ sent: true }).eq("id", alert.id);

      let serviceIds: string[] | null = null;
      try {
        serviceIds = typeof alert.service_ids === "string"
          ? JSON.parse(alert.service_ids)
          : alert.service_ids;
      } catch { serviceIds = null; }

      // Yearly limit check for review requests
      if (alert.alert_type === "review_request" && alert.yearly_limit) {
        let clientPhone = "";
        if (serviceIds?.length) {
          const { data: svc } = await supabase.from("Services").select("property_id, customer_id").eq("id", serviceIds[0]).single();
          if (svc) {
            let clientId = svc.customer_id;
            if (!clientId && svc.property_id) {
              const { data: prop } = await supabase.from("Properties").select("customer_id, client_id").eq("id", svc.property_id).single();
              clientId = prop?.customer_id || prop?.client_id;
            }
            if (clientId) {
              const { data: cl } = await supabase.from("Clients").select("phone").eq("id", clientId).single();
              clientPhone = (cl?.phone || "").replace(/\D/g, "");
            }
          }
        }
        if (clientPhone) {
          const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
          const fmt = clientPhone.length === 10 ? "+1" + clientPhone : "+" + clientPhone;
          const { data: prior } = await supabase
            .from("sms_messages")
            .select("id")
            .eq("user_id", alert.user_id)
            .eq("alert_type", "review_request")
            .eq("direction", "outbound")
            .gte("sent_at", oneYearAgo)
            .or(`phone_to.eq.${fmt},phone_to.eq.+1${clientPhone},phone_to.eq.${clientPhone}`)
            .limit(1);
          if (prior?.length) {
            results.push({ source: "pending_sms_alerts", id: alert.id, skipped: true, reason: "yearly_limit" });
            continue;
          }
        }
      }

      const res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms-alert`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            alert_type:    alert.alert_type,
            service_ids:   serviceIds,
            estimate_id:   alert.estimate_id || undefined,
            user_id:       alert.user_id,
            alert_message: alert.alert_message || undefined,
            force_send:    true,
          }),
        }
      );

      const json = await res.json().catch(() => ({ error: "bad response" }));
      results.push({ source: "pending_sms_alerts", id: alert.id, ...json });
    }

    // ── 2. Process estimate follow-ups ─────────────────────────────────────
    const { data: followups, error: fuErr } = await supabase
      .from("pending_estimate_followups")
      .select("*")
      .eq("sent", false)
      .lte("send_at", new Date().toISOString());

    if (!fuErr && followups?.length) {
      for (const fu of followups) {
        // Mark sent first to prevent double-send
        await supabase.from("pending_estimate_followups").update({ sent: true }).eq("id", fu.id);

        // Check estimate is still open (not accepted/declined/expired)
        const { data: est } = await supabase
          .from("estimates")
          .select("status, client_id, lead_id")
          .eq("id", fu.estimate_id)
          .single();

        if (!est || ["accepted", "declined", "expired"].includes(est.status ?? "")) {
          results.push({ source: "pending_estimate_followups", id: fu.id, skipped: true, reason: est?.status ?? "not found" });
          continue;
        }

        // Check toggle for this slot
        const alertType = `estimate_followup_${fu.slot}`;
        const { data: toggle } = await supabase
          .from("alert_toggles")
          .select("sms_enabled, email_enabled")
          .eq("user_id", fu.user_id)
          .eq("alert_type", alertType)
          .single();

        if (!toggle?.sms_enabled && !toggle?.email_enabled) {
          results.push({ source: "pending_estimate_followups", id: fu.id, skipped: true, reason: "toggle_off" });
          continue;
        }

        // Get follow-up message for this slot
        const { data: setting } = await supabase
          .from("estimate_followup_settings")
          .select("message")
          .eq("user_id", fu.user_id)
          .eq("slot", fu.slot)
          .single();

        if (!setting?.message) {
          results.push({ source: "pending_estimate_followups", id: fu.id, skipped: true, reason: "no_message" });
          continue;
        }

        // Send via send-sms-alert with force_send
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms-alert`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              alert_type:    alertType,
              estimate_id:   fu.estimate_id,
              user_id:       fu.user_id,
              alert_message: setting.message,
              force_send:    true,
            }),
          }
        );

        const json = await res.json().catch(() => ({ error: "bad response" }));
        results.push({ source: "pending_estimate_followups", id: fu.id, ...json });
      }
    }

    // ── 3. Process payment follow-ups ──────────────────────────────────────
    const { data: payFollowups } = await supabase
      .from("pending_payment_followups")
      .select("*")
      .eq("sent", false)
      .lte("send_at", new Date().toISOString());

    for (const fu of (payFollowups ?? [])) {
      await supabase.from("pending_payment_followups").update({ sent: true }).eq("id", fu.id);

      const alertType = `payment_followup_${fu.slot}`;
      const { data: toggle } = await supabase
        .from("alert_toggles")
        .select("sms_enabled, email_enabled")
        .eq("user_id", fu.user_id)
        .eq("alert_type", alertType)
        .single();

      if (!toggle?.sms_enabled && !toggle?.email_enabled) {
        results.push({ source: "pending_payment_followups", id: fu.id, skipped: true, reason: "toggle_off" });
        continue;
      }

      const { data: setting } = await supabase
        .from("alert_settings")
        .select("message, pause_services")
        .eq("user_id", fu.user_id)
        .eq("alert_type", alertType)
        .single();

      if (!setting?.message) {
        results.push({ source: "pending_payment_followups", id: fu.id, skipped: true, reason: "no_message" });
        continue;
      }

      // Slot 3 with pause_services: put all upcoming services for this client on hold
      if (fu.slot === 3 && setting.pause_services && fu.client_id) {
        await supabase
          .from("Services")
          .update({ status: "on_hold" })
          .eq("customer_id", fu.client_id)
          .eq("dispatched", false);
      }

      const res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms-alert`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            alert_type:    alertType,
            client_id:     fu.client_id,
            user_id:       fu.user_id,
            alert_message: setting.message,
            force_send:    true,
          }),
        }
      );

      const json = await res.json().catch(() => ({ error: "bad response" }));
      results.push({ source: "pending_payment_followups", id: fu.id, ...json });
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
