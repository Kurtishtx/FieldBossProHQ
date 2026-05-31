import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const formData = await req.formData();
    const from    = formData.get("From")?.toString() || "";
    const to      = formData.get("To")?.toString() || "";
    const body    = formData.get("Body")?.toString() || "";
    const sid     = formData.get("MessageSid")?.toString() || null;

    if (!from || !to || !body) {
      return twiml();
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find which user owns this Twilio number
    const { data: twilioRow } = await supabase
      .from("twilio_settings")
      .select("user_id")
      .eq("phone_number", to)
      .single();

    if (!twilioRow?.user_id) {
      return twiml();
    }

    const userId = twilioRow.user_id;

    // Try to find a client name by matching phone number
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

    return twiml();
  } catch (err) {
    console.error(err);
    return twiml();
  }
});

function twiml() {
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
