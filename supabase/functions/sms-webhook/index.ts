import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const rawBody = await req.text();
    const urlObj  = new URL(req.url);

    let from = "", to = "", body = "";

    // voip.ms sends: did, contact, message (form-encoded or query params)
    const params = new URLSearchParams(rawBody);
    from = params.get("contact") || params.get("from") || params.get("From") || "";
    to   = params.get("did")     || params.get("to")   || params.get("To")   || "";
    body = params.get("message") || params.get("Body") || "";

    // Try URL query params
    if (!from) {
      from = urlObj.searchParams.get("contact") || urlObj.searchParams.get("from") || urlObj.searchParams.get("From") || "";
      to   = urlObj.searchParams.get("did")     || urlObj.searchParams.get("to")   || urlObj.searchParams.get("To")   || "";
      body = urlObj.searchParams.get("message") || urlObj.searchParams.get("Body") || "";
    }

    // Try JSON
    if (!from) {
      try {
        const payload = JSON.parse(rawBody);
        from = (payload.contact || payload.from || payload.From || "").toString();
        to   = (payload.did     || payload.to   || payload.To   || "").toString();
        body = (payload.message || payload.Body || "").toString();
      } catch (_) {}
    }

    if (!from || !body) {
      return new Response("ok", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const didClean = to.replace(/\D/g, "");
    const { data: voipRow } = await supabase
      .from("twilio_settings")
      .select("user_id")
      .or(`phone_number.eq.${to},phone_number.eq.${didClean}`)
      .single();

    if (!voipRow?.user_id) return new Response("ok", { status: 200 });

    const userId = voipRow.user_id;
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
      if (cl) { clientName = (cl.first_name + " " + cl.last_name).trim(); break; }
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
    console.error("ERROR:", String(err));
    return new Response("ok", { status: 200 });
  }
});
