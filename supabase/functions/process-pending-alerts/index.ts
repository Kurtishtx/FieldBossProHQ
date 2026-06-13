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

    // Find all pending alerts that are now due
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

    if (!pending?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const alert of pending) {
      // Mark sent first to prevent double-send if cron overlaps
      await supabase
        .from("pending_sms_alerts")
        .update({ sent: true })
        .eq("id", alert.id);

      // Parse service_ids (stored as JSON string)
      let serviceIds: string[] | null = null;
      try {
        serviceIds = typeof alert.service_ids === "string"
          ? JSON.parse(alert.service_ids)
          : alert.service_ids;
      } catch { serviceIds = null; }

      // Call send-sms-alert with force_send to bypass the time check
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
            user_id:       alert.user_id,
            alert_message: alert.alert_message || undefined,
            force_send:    true,
          }),
        }
      );

      const json = await res.json().catch(() => ({ error: "bad response" }));
      results.push({ id: alert.id, user_id: alert.user_id, ...json });
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
