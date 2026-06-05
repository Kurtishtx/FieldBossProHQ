import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const rawText = await req.text();
    const urlObj  = new URL(req.url);
    const params  = new URLSearchParams(rawText);

    let from = "", to = "", body = "";

    try {
      const json = JSON.parse(rawText);
      // voip.ms webhook format: { data: { payload: { from, to, text } } }
      const payload = json.data?.payload || json.payload || json;
      // from is an object { phone_number: "..." }
      const fromObj = payload.from || payload.contact || payload.From || "";
      from = (typeof fromObj === "object" ? fromObj.phone_number : fromObj) || "";
      // to is an array [{ phone_number: "..." }]
      const toObj = payload.to || payload.did || payload.To || "";
      to = Array.isArray(toObj) ? (toObj[0]?.phone_number || "") : (typeof toObj === "object" ? toObj.phone_number : toObj) || "";
      body = payload.text || payload.message || payload.body || payload.Body || "";
    } catch (_) {
      const params = new URLSearchParams(rawText);
      from = params.get("contact") || params.get("from") || params.get("From") || urlObj.searchParams.get("from") || "";
      to   = params.get("did")     || params.get("to")   || params.get("To")   || urlObj.searchParams.get("to")   || "";
      body = params.get("message") || params.get("Body") || urlObj.searchParams.get("message") || "";
    }

    const sid = null;
    console.log("from:", from, "to:", to, "body:", body);

    if (!from || !to || !body) {
      console.log("Missing fields - skipping");
      return new Response("ok", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const toClean = to.replace(/\D/g, "");
    const { data: twilioRow } = await supabase
      .from("twilio_settings")
      .select("user_id")
      .or(`phone_number.eq.${to},phone_number.eq.${toClean}`)
      .single();

    if (!twilioRow?.user_id) {
      console.log("No user found for DID:", to);
      return new Response("ok", { status: 200 });
    }

    const userId = twilioRow.user_id;
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
      user_id:    userId,
      client_name: clientName || from,
      phone_from: from,
      phone_to:   to,
      body,
      direction:  "inbound",
      twilio_sid: sid,
      alert_type: null,
      sent_at:    new Date().toISOString(),
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("ok", { status: 200 });
  }
});
