import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { to, message, client_name, user_id } = await req.json();
    if (!to || !message || !user_id) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: voip } = await supabase
      .from("twilio_settings")
      .select("account_sid, auth_token, phone_number")
      .eq("user_id", user_id)
      .single();

    if (!voip?.account_sid || !voip?.auth_token || !voip?.phone_number) {
      return new Response(JSON.stringify({ error: "voip.ms not configured for this account" }), { status: 400, headers: cors });
    }

    const toClean  = to.replace(/^\+/, "");
    const didClean = voip.phone_number.replace(/\D/g, "");
    const url = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(voip.account_sid)}&api_password=${encodeURIComponent(voip.auth_token)}&method=sendSMS&did=${didClean}&dst=${toClean}&message=${encodeURIComponent(message)}`;

    const res  = await fetch(url);
    const json = await res.json();

    if (json.status !== "success") {
      return new Response(JSON.stringify({ error: json.status }), { status: 400, headers: cors });
    }

    await supabase.from("sms_messages").insert({
      user_id,
      client_name: client_name || to,
      phone_to: to,
      phone_from: voip.phone_number,
      body: message,
      direction: "outbound",
      twilio_sid: null,
      sent_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: cors,
    });
  }
});
