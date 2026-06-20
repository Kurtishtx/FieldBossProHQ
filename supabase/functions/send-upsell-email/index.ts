import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = "re_apd6qCQb_LerK8x5aS84YU4J7jj6WarnM";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { property_ids, user_id, subject: overrideSubject, body: overrideBody, template_key } = await req.json();
    if (!property_ids?.length || !user_id) {
      return new Response(JSON.stringify({ error: "Missing property_ids or user_id" }), { status: 400, headers: CORS });
    }

    // Load email template (fall back to upsell_email)
    const key = template_key || "upsell_email";
    const { data: tmpl } = await supabase.from("email_templates")
      .select("subject, body, from_name, reply_to")
      .eq("key", key).eq("user_id", user_id).single();

    const subject  = overrideSubject || tmpl?.subject  || "A special offer from [companyname]";
    const bodyTmpl = overrideBody    || tmpl?.body     || "Hi [clientfirstname],\n\nWe wanted to reach out with a special offer just for you.\n\nThank you,\n[companyname]";

    // Load company info
    const { data: co } = await supabase.from("company_info")
      .select("company_name, display_name, phone").eq("user_id", user_id).single();
    const compName  = co?.display_name || co?.company_name || "Your Company";
    const compPhone = co?.phone || "";
    const fromName  = tmpl?.from_name || compName;

    // Load properties
    const { data: props } = await supabase.from("Properties")
      .select("id, customer_id").in("id", property_ids).eq("user_id", user_id);

    if (!props?.length) {
      return new Response(JSON.stringify({ error: "No matching properties found" }), { status: 404, headers: CORS });
    }

    // Load clients
    const customerIds = [...new Set(props.map((p: any) => p.customer_id).filter(Boolean))];
    const { data: clients } = await supabase.from("Clients")
      .select("id, email, first_name, last_name, name").in("id", customerIds);

    const clientMap: Record<string, any> = {};
    (clients || []).forEach((c: any) => { clientMap[c.id] = c; });

    let sent = 0, skipped = 0;
    const errors: string[] = [];
    const sentClientIds = new Set<string>();

    for (const prop of (props as any[])) {
      const client = clientMap[prop.customer_id];
      if (!client?.email) { skipped++; continue; }
      if (sentClientIds.has(client.id)) { skipped++; continue; }
      sentClientIds.add(client.id);

      const firstName = client.first_name || (client.name || "").split(" ")[0] || "";
      const fullName  = client.name || ((client.first_name || "") + " " + (client.last_name || "")).trim() || client.email;

      const replace = (s: string) => s
        .replace(/\[clientname\]/gi,      fullName)
        .replace(/\[clientfirstname\]/gi, firstName)
        .replace(/\[companyname\]/gi,     compName)
        .replace(/\[companyphone\]/gi,    compPhone);

      const finalSubject = replace(subject);
      const finalBody    = replace(bodyTmpl);
      const htmlBody = "<pre style='font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap;'>" +
        finalBody.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre>";

      const emailPayload: any = {
        from:    fromName + " <Mail@fieldbossprohq.com>",
        to:      [client.email],
        subject: finalSubject,
        html:    htmlBody,
      };
      if (tmpl?.reply_to) emailPayload.reply_to = tmpl.reply_to;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(emailPayload),
      });

      if (res.ok) {
        sent++;
      } else {
        const d = await res.json();
        errors.push(client.email + ": " + (d.message || d.error?.message || res.status));
        skipped++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, errors }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
