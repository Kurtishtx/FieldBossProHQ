import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { estimate_id } = await req.json();
    if (!estimate_id) return new Response(JSON.stringify({ error: "Missing estimate_id" }), { status: 400, headers: CORS });

    // Load estimate
    const { data: est, error: estErr } = await supabase.from("estimates").select("*").eq("id", estimate_id).single();
    if (estErr || !est) return new Response(JSON.stringify({ error: "Estimate not found: id=" + estimate_id + (estErr ? " | " + estErr.message : "") }), { status: 404, headers: CORS });

    const RESEND_API_KEY = "re_apd6qCQb_LerK8x5aS84YU4J7jj6WarnM";

    // Load company info (site URL, company name)
    const { data: co } = await supabase.from("company_info").select("company_name, display_name, site_url").eq("user_id", est.user_id).single();

    // Load email template
    const { data: tmpl } = await supabase.from("email_templates").select("*").eq("key", "estimate_email").eq("user_id", est.user_id).single();
    const subject  = tmpl?.subject  || "Your Estimate from [companyname]";
    const bodyTmpl = tmpl?.body     || "Hi [clientname],\n\nPlease review your estimate #[estimatenumber] for [estimatetotal].\n\nView your estimate here:\n[estimatelink]\n\nThis estimate expires on [expirydate].\n\nThank you,\n[companyname]";
    const fromName = tmpl?.from_name || co?.display_name || co?.company_name || "IndustryBossPro";
    const replyTo  = tmpl?.reply_to || null;

    // Load client email — check Clients, then Leads, then via property_id
    let toEmail = "";
    if (est.customer_id) {
      const { data: cl } = await supabase.from("Clients").select("email").eq("id", est.customer_id).single();
      toEmail = cl?.email || "";
      if (!toEmail) {
        const { data: lead } = await supabase.from("Leads").select("email").eq("id", est.customer_id).single();
        toEmail = lead?.email || "";
      }
    }
    if (!toEmail && est.property_id) {
      const { data: prop } = await supabase.from("Properties").select("customer_id").eq("id", est.property_id).single();
      if (prop?.customer_id) {
        const { data: cl } = await supabase.from("Clients").select("email").eq("id", prop.customer_id).single();
        toEmail = cl?.email || "";
      }
    }
    if (!toEmail) return new Response(JSON.stringify({ error: "No email address on file for this lead/client." }), { status: 400, headers: CORS });

    // Build estimate link
    const baseUrl    = "https://my.industrybosspro.com";
    const estLink    = baseUrl + "/estimate-view.html?id=" + estimate_id;
    const compName   = co?.display_name || co?.company_name || "IndustryBossPro";
    const clientName = est.client_name || "";
    const expiry     = est.expiry_date ? new Date(est.expiry_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "N/A";
    const total      = "$" + (parseFloat(est.amount) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    function replace(s: string) {
      return s
        .replace(/\[clientname\]/g,      clientName)
        .replace(/\[estimatenumber\]/g,   String(est.estimate_number || ""))
        .replace(/\[estimatetotal\]/g,    total)
        .replace(/\[expirydate\]/g,       expiry)
        .replace(/\[companyname\]/g,      compName)
        .replace(/\[estimatelink\]/g,     estLink);
    }

    const finalSubject = replace(subject);
    const finalBody    = replace(bodyTmpl);

    // Convert plain text body to basic HTML
    const htmlBody = "<pre style='font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap;'>" +
      finalBody.replace(/</g, "&lt;").replace(/>/g, "&gt;") +
      "</pre>" +
      "<p style='margin-top:24px;'><a href='" + estLink + "' style='display:inline-block;background:#e07820;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;font-weight:700;font-size:15px;'>View &amp; Accept Estimate</a></p>";

    // Send via Resend
    const emailPayload: any = {
      from:    fromName + " <Mail@industrybosspro.com>",
      to:      [toEmail],
      subject: finalSubject,
      html:    htmlBody,
    };
    if (replyTo) emailPayload.reply_to = replyTo;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error("Resend " + resendRes.status + ": " + (resendData.message || resendData.error?.message || JSON.stringify(resendData)));

    // Mark estimate as sent
    await supabase.from("estimates").update({ status: "sent" }).eq("id", estimate_id);

    return new Response(JSON.stringify({ ok: true, email_id: resendData.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
