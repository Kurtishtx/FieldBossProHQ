import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    let from = "", to = "", body = "";

    if (req.method === "GET") {
      // URL Callback (GET) format
      const url = new URL(req.url);
      from = url.searchParams.get("from") || url.searchParams.get("From") || "";
      to   = url.searchParams.get("to")   || url.searchParams.get("To")   || "";
      body = url.searchParams.get("message") || url.searchParams.get("Body") || "";
    } else {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await req.json();
        from = (payload.from || payload.From || "").toString();
        to   = (payload.to   || payload.To   || "").toString();
        body = (payload.message || payload.Body || "").toString();
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        const params = new URLSearchParams(text);
        from = params.get("from") || params.get("From") || "";
        to   = params.get("to")   || params.get("To")   || "";
        body = params.get("message") || params.get("Body") || "";
      } else {
        // Try JSON, fall back to text params
        const text = await req.text();
        try {
          const payload = JSON.parse(text);
          from = (payload.from || payload.From || "").toString();
          to   = (payload.to   || payload.To   || "").toString();
          body = (payload.message || payload.Body || "").toString();
        } catch {
          const params = new URLSearchParams(text);
          from = params.get("from") || params.get("From") || "";
          to   = params.get("to")   || params.get("To")   || "";
          body = params.get("message") || params.get("Body") || "";
        }
      }
    }

    if (!from || !to || !body) {
      return new Response("ok", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find which user owns this DID number
    const didClean = to.replace(/\D/g, "");
    const { data: voipRow } = await supabase
      .from("twilio_settings")
      .select("user_id")
      .or(`phone_number.eq.${to},phone_number.eq.${didClean}`)
      .single();

    if (!voipRow?.user_id) {
      return new Response("ok", { status: 200 });
    }

    const userId = voipRow.user_id;

    // Try to find client name by phone number
    const digitsOnly = from.replace(/\D/g, "");
    const variants = [from, digitsOnly, "+" + digitsOnly];

    let clientName = "";
    for (const v of variants) {
      const { data: cl } = await supabase
        .from("Clients")
        .select("first_name, last_name")
        .or(`phone.eq.${v},mobile.eq.${v},cell.eq.${v}`)
        .limit(1)
        .single();
      if (cl) {
        clientName = (cl.first_name + " " + cl.last_name).trim();
        break;
      }
    }

    await supabase.from("sms_messages").insert({
      user_id:     userId,
      client_name: clientName || from,
      phone_from:  from,
      phone_to:    to,
      body,
      direction:   "inbound",
      twilio_sid:  null,
      alert_type:  null,
      sent_at:     new Date().toISOString(),
    });

    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error(err);
    return new Response("ok", { status: 200 });
  }
});
