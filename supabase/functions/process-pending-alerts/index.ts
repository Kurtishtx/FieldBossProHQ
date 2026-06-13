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
          .select("sms_enabled")
          .eq("user_id", fu.user_id)
          .eq("alert_type", alertType)
          .single();

        if (!toggle?.sms_enabled) {
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
