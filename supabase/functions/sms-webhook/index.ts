import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const method = req.method;
    const urlObj = new URL(req.url);
    const contentType = req.headers.get("content-type") || "";
    const rawBody = await req.text();

    console.log("VOIPMS WEBHOOK HIT");
    console.log("METHOD:", method);
    console.log("CONTENT-TYPE:", contentType);
    console.log("RAW BODY:", rawBody);
    console.log("QUERY PARAMS:", urlObj.search);

    let from = "", to = "", body = "";

    // Try URL params first (GET callback)
    from = urlObj.searchParams.get("from") || urlObj.searchParams.get("From") || "";
    to   = urlObj.searchParams.get("to")   || urlObj.searchParams.get("To")   || "";
    body = urlObj.searchParams.get("message") || urlObj.searchParams.get("Body") || "";

    // Try JSON body
    if (!from && rawBody) {
      try {
        const payload = JSON.parse(rawBody);
        from = from || (payload.from || payload.From || "").toString();
        to   = to   || (payload.to   || payload.To   || "").toString();
        body = body || (payload.message || payload.Body || "").toString();
      } catch (_) {
        // Try form-encoded
        const params = new URLSearchParams(rawBody);
        from = from || params.get("from") || params.get("From") || "";
        to   = to   || params.get("to")   || params.get("To")   || "";
        body = body || params.get("message") || params.get("Body") || "";
      }
    }

    console.log("PARSED from:", from, "to:", to, "body:", body);

    if (!from || !body) {
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
      console.log("No user found for DID:", to);
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

    console.log("SMS saved successfully");
    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("ERROR:", String(err));
    return new Response("ok", { status: 200 });
  }
});
