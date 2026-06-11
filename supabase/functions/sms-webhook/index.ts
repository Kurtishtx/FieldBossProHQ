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
    const toLast10 = toClean.slice(-10);
    const { data: twilioRow } = await supabase
      .from("twilio_settings")
      .select("user_id")
      .or(`phone_number.eq.${to},phone_number.eq.${toClean},phone_number.eq.${toLast10}`)
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

    // Fire text_received employee alert
    try {
      const { data: toggles } = await supabase
        .from("alert_toggles")
        .select("sms_enabled, email_enabled")
        .eq("user_id", userId)
        .eq("alert_type", "text_received")
        .single();

      const smsEnabled   = toggles?.sms_enabled   ?? true;
      const emailEnabled = toggles?.email_enabled ?? false;

      if (smsEnabled || emailEnabled) {
        const { data: alertRow } = await supabase
          .from("alert_settings")
          .select("message, recipients")
          .eq("user_id", userId)
          .eq("alert_type", "text_received")
          .single();

        if (alertRow?.message) {
          const displayName = clientName || from;
          const alertMsg = alertRow.message
            .replace(/\[clientname\]/g, displayName)
            .replace(/\[message\]/g, body);

          // ── SMS ──
          if (smsEnabled && alertRow.recipients) {
            const phones: string[] = (() => { try { return JSON.parse(alertRow.recipients); } catch { return []; } })();
            if (phones.length > 0) {
              const { data: voip } = await supabase
                .from("twilio_settings")
                .select("account_sid, auth_token, phone_number")
                .eq("user_id", userId)
                .single();

              if (voip?.account_sid && voip?.auth_token && voip?.phone_number) {
                const didClean = voip.phone_number.replace(/\D/g, "");
                for (const phone of phones) {
                  let dstClean = phone.replace(/\D/g, "");
                  if (dstClean.length === 10) dstClean = "1" + dstClean;
                  const voipUrl =
                    `https://voip.ms/api/v1/rest.php` +
                    `?api_username=${encodeURIComponent(voip.account_sid)}` +
                    `&api_password=${encodeURIComponent(voip.auth_token)}` +
                    `&method=sendSMS&did=${didClean}&dst=${dstClean}` +
                    `&message=${encodeURIComponent(alertMsg)}`;
                  await fetch(voipUrl);
                }
              }
            }
          }

          // ── Email ──
          if (emailEnabled) {
            const { data: co } = await supabase
              .from("company_info")
              .select("resend_api_key, company_name")
              .eq("user_id", userId)
              .single();

            if (co?.resend_api_key) {
              const { data: { user: ownerUser } } = await supabase.auth.admin.getUserById(userId);
              const ownerEmail = ownerUser?.email;
              if (ownerEmail) {
                const htmlBody = alertMsg
                  .split("\n")
                  .map((line: string) => `<p style="margin:0 0 8px;font-family:sans-serif;font-size:15px;color:#222">${line || "&nbsp;"}</p>`)
                  .join("");
                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { Authorization: "Bearer " + co.resend_api_key, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from: (co.company_name || "SprayBossPro") + " <mail@spraybosspro.com>",
                    to: [ownerEmail],
                    subject: "Text Received: " + displayName,
                    html: `<!DOCTYPE html><html><body style="max-width:600px;margin:0 auto;padding:24px">${htmlBody}</body></html>`,
                  }),
                });
              }
            }
          }
        }
      }
    } catch (alertErr) {
      console.error("text_received alert error:", alertErr);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("ok", { status: 200 });
  }
});
