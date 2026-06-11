import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Build styled HTML email from alert_email_settings + body text ──────────
function buildEmailHtml(style: number, info: any, bodyText: string): string {
  const e = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const logo = info?.company_logo
    ? `<img src="${e(info.company_logo)}" style="max-height:80px;max-width:220px;object-fit:contain;" alt=""/>`
    : "";
  const co   = e(info?.company_name || "");
  const sf   = e(info?.signoff_name || info?.company_name || "");
  const foot = [e(info?.company_address || ""), e(info?.company_phone || ""), e(info?.company_website || "")]
    .filter(Boolean).join(" &bull; ");
  const bodyHtml = bodyText.split(/\n\n+/).map((p: string) =>
    "<p style='margin:0 0 16px;'>" + p.split(/\n/).map((l: string) => e(l)).join("<br/>") + "</p>"
  ).join("");
  const signoff = `<p style='margin:20px 0 0;'>Thank you,<br/><strong>${sf}</strong></p>`;

  if (style === 2) {
    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1a1a2e;padding:26px 32px;text-align:center;">
${logo ? `<div style="margin-bottom:10px;">${logo}</div>` : ""}
${co ? `<div style="color:#fff;font-size:22px;font-weight:700;">${co}</div>` : ""}
</td></tr>
<tr><td style="padding:32px;font-size:15px;color:#333;line-height:1.7;">${bodyHtml}${signoff}</td></tr>
${foot ? `<tr><td style="background:#1a1a2e;padding:14px 32px;text-align:center;font-size:11px;color:#aaa;">${foot}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  }

  if (style === 3) {
    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#5b2d8e;padding:26px 32px;text-align:center;">
${logo ? `<div style="margin-bottom:10px;">${logo}</div>` : ""}
${co ? `<div style="color:#fff;font-size:24px;font-weight:800;">${co}</div>` : ""}
</td></tr>
<tr><td style="padding:32px;font-size:15px;color:#333;line-height:1.7;">${bodyHtml}${signoff}</td></tr>
${foot ? `<tr><td style="background:#f0e8fa;padding:14px 32px;text-align:center;font-size:11px;color:#7a5c8e;">${foot}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  }

  if (style === 4) {
    const bigLogo = info?.company_logo
      ? `<img src="${e(info.company_logo)}" style="max-height:140px;max-width:90%;width:auto;object-fit:contain;" alt=""/>`
      : "";
    return `<!DOCTYPE html><html><body style="margin:0;background:#0e0e0e;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:#0e0e0e;border-radius:8px;overflow:hidden;border:1px solid #333;">
<tr><td style="background:#1a1a1a;padding:28px 20px;text-align:center;border-bottom:2px solid #e07820;">
${bigLogo}
</td></tr>
<tr><td style="padding:32px;font-size:15px;color:#ddd;line-height:1.7;">${bodyHtml}<p style='margin:20px 0 0;color:#ddd;'>Thank you for your business!<br/><strong style="color:#e07820;">${sf}</strong></p></td></tr>
${foot ? `<tr><td style="background:#1a1a1a;border-top:2px solid #e07820;padding:14px 32px;text-align:center;font-size:11px;color:#888;">${foot}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  }

  // Style 1 — Clean & Simple (default)
  return `<!DOCTYPE html><html><body style="margin:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:26px 32px;text-align:center;border-bottom:1px solid #eee;">
${logo ? `<div style="margin-bottom:10px;">${logo}</div>` : ""}
${co ? `<div style="font-size:20px;font-weight:700;color:#222;">${co}</div>` : ""}
</td></tr>
<tr><td style="padding:32px;font-size:15px;color:#333;line-height:1.7;">${bodyHtml}${signoff}</td></tr>
${foot ? `<tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;">${foot}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}

function emailSubject(alertType: string, companyName: string): string {
  const n = companyName || "Your Service Provider";
  const map: Record<string, string> = {
    scheduled:                  `Your Service is Scheduled — ${n}`,
    reschedule:                 `Your Service Has Been Rescheduled — ${n}`,
    completed:                  `Your Service is Complete — ${n}`,
    estimate_sent:              `Your Estimate — ${n}`,
    mobile_property_scheduled:  `You're Up Next — ${n}`,
  };
  return map[alertType] || `Alert from ${n}`;
}

function subVars(msg: string, vars: Record<string, string>): string {
  for (const [key, val] of Object.entries(vars)) {
    msg = msg.split(`[${key}]`).join(val || "");
  }
  return msg;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { alert_type, service_ids, user_id, alert_message, estimate_id, skip_note } = await req.json();
    if (!alert_type || !user_id || (!service_ids?.length && !estimate_id)) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Resolve owner user_id (sub-users point to tenant_id) ─────────────────
    let ownerUserId = user_id;
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", user_id)
      .single();
    if (prof?.tenant_id) ownerUserId = prof.tenant_id;

    // ── Channel toggles ───────────────────────────────────────────────────────
    const { data: toggles, error: toggleErr } = await supabase
      .from("alert_toggles")
      .select("sms_enabled, email_enabled")
      .eq("user_id", ownerUserId)
      .eq("alert_type", alert_type)
      .single();

    // No toggle row = backward compat: SMS on (matches old behavior), email off
    const smsEnabled   = toggles ? (toggles.sms_enabled   ?? false) : true;
    const emailEnabled = toggles ? (toggles.email_enabled ?? false) : false;

    if (!smsEnabled && !emailEnabled) {
      return new Response(JSON.stringify({ skipped: "all channels disabled" }), { headers: cors });
    }

    // ── Message template ──────────────────────────────────────────────────────
    let msgTemplate: string | null = alert_message || null;
    if (!msgTemplate) {
      const { data: ar } = await supabase
        .from("alert_settings")
        .select("message")
        .eq("user_id", user_id)
        .eq("alert_type", alert_type)
        .limit(1);
      msgTemplate = ar?.[0]?.message || null;
    }
    if (!msgTemplate) {
      return new Response(JSON.stringify({ skipped: "no message configured" }), { headers: cors });
    }

    // ── SMS credentials ───────────────────────────────────────────────────────
    let twilio: any = null;
    if (smsEnabled) {
      const { data: t } = await supabase
        .from("twilio_settings")
        .select("account_sid, auth_token, phone_number")
        .eq("user_id", user_id)
        .single();
      twilio = t;
    }
    const canSms = smsEnabled && !!(twilio?.account_sid && twilio?.auth_token && twilio?.phone_number);

    // ── Email settings ────────────────────────────────────────────────────────
    let emailInfo: any = null;
    let resendKey: string | null = null;
    if (emailEnabled) {
      const { data: aes } = await supabase
        .from("alert_email_settings")
        .select("*")
        .eq("user_id", user_id)
        .single();
      emailInfo = aes;
      const { data: ci } = await supabase
        .from("company_info")
        .select("resend_api_key")
        .eq("user_id", user_id)
        .single();
      resendKey = ci?.resend_api_key || "re_apd6qCQb_LerK8x5aS84YU4J7jj6WarnM";
    }
    const canEmail = emailEnabled && !!resendKey;

    // ── Company info ──────────────────────────────────────────────────────────
    const { data: company } = await supabase
      .from("company_info")
      .select("*")
      .eq("user_id", user_id)
      .single();
    const companyName = company?.company_name || company?.display_name || "";

    // ── SMS sender helper ─────────────────────────────────────────────────────
    async function sendSms(toPhone: string, msg: string): Promise<string> {
      if (!canSms) return "skipped_no_voip";
      const toClean  = toPhone.replace(/^\+/, "");
      const didClean = (twilio.phone_number as string).replace(/\D/g, "");
      const parts: string[] = [];
      let rem = msg;
      while (rem.length > 0 && parts.length < 3) {
        if (rem.length <= 160) { parts.push(rem); break; }
        let cut = 160;
        while (cut > 0 && rem[cut] !== " " && rem[cut] !== "\n") cut--;
        if (cut === 0) cut = 160;
        parts.push(rem.substring(0, cut).trimEnd());
        rem = rem.substring(cut).trimStart();
      }
      let last = "success";
      for (const p of parts) {
        const url = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(twilio.account_sid)}&api_password=${encodeURIComponent(twilio.auth_token)}&method=sendSMS&did=${didClean}&dst=${toClean}&message=${encodeURIComponent(p)}`;
        const vr = await fetch(url);
        const vj = await vr.json();
        if (vj.status !== "success") last = vj.status;
      }
      return last;
    }

    // ── Email sender helper ───────────────────────────────────────────────────
    async function sendEmail(toEmail: string, msg: string): Promise<{ ok: boolean; err?: string }> {
      if (!canEmail) return { ok: false, err: "email not configured" };
      const style   = emailInfo?.template_style || 1;
      const html    = buildEmailHtml(style, emailInfo, msg);
      const subject = emailSubject(alert_type, emailInfo?.company_name || companyName);
      const from    = (emailInfo?.company_name || companyName || "SprayBossPro") + " <Kurtis@SprayBossPro.com>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + resendKey!, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [toEmail], subject, html }),
      });
      const d = await res.json();
      return res.ok ? { ok: true } : { ok: false, err: d.message || JSON.stringify(d) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ESTIMATE ALERT FLOW
    // ─────────────────────────────────────────────────────────────────────────
    if (estimate_id) {
      const { data: est } = await supabase.from("estimates").select("*").eq("id", estimate_id).single();
      if (!est) return new Response(JSON.stringify({ skipped: "estimate not found" }), { headers: cors });

      let clientName = est.client_name || "";
      let firstName  = clientName.split(" ")[0] || "";
      let lastName   = clientName.split(" ").slice(1).join(" ") || "";
      let phone = "";
      let toEmail = "";

      if (est.customer_id) {
        const { data: lead } = await supabase.from("Leads").select("name, phone, first_name, last_name, email").eq("id", est.customer_id).single();
        if (lead) {
          firstName = lead.first_name || lead.name?.split(" ")[0] || firstName;
          lastName  = lead.last_name  || lead.name?.split(" ").slice(1).join(" ") || lastName;
          phone     = (lead.phone || "").replace(/\D/g, "");
          toEmail   = lead.email || "";
        }
        if (!phone || !toEmail) {
          const { data: cl } = await supabase.from("Clients").select("phone, first_name, last_name, email").eq("id", est.customer_id).single();
          if (cl) {
            if (!phone)    { firstName = cl.first_name || firstName; lastName = cl.last_name || lastName; phone = (cl.phone || "").replace(/\D/g, ""); }
            if (!toEmail)  toEmail = cl.email || "";
          }
        }
      }

      const msg = subVars(msgTemplate, {
        clientname:      (firstName + " " + lastName).trim(),
        clientfirstname: firstName,
        clientlastname:  lastName,
        estimateamount:  est.amount ? "$" + parseFloat(est.amount).toFixed(2) : "",
        estimatenumber:  est.estimate_number ? String(est.estimate_number) : "",
        companyname:     companyName,
        companyphone:    company?.phone || "",
        companywebsite:  company?.website || "",
      });

      const results: any[] = [];

      if (canSms && phone) {
        const formatted = phone.length === 10 ? "+1" + phone : phone.length === 11 ? "+" + phone : phone;
        const status = await sendSms(formatted, msg);
        results.push({ channel: "sms", to: formatted, status });
        await supabase.from("sms_messages").insert({
          user_id, client_name: (firstName + " " + lastName).trim(),
          phone_to: formatted, phone_from: twilio.phone_number,
          body: msg, direction: "outbound", twilio_sid: null,
          alert_type, sent_at: new Date().toISOString(),
        });
      }

      if (canEmail && toEmail) {
        const r = await sendEmail(toEmail, msg);
        results.push({ channel: "email", to: toEmail, ...r });
      }

      return new Response(JSON.stringify({ results }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SKIPPED ALERT FLOW  (employee SMS only — no client email for this one)
    // ─────────────────────────────────────────────────────────────────────────
    if (alert_type === "skipped") {
      if (!canSms) {
        return new Response(JSON.stringify({ skipped: "SMS disabled or not configured" }), { headers: cors });
      }

      const { data: skippedSettings } = await supabase
        .from("alert_settings")
        .select("message, recipients")
        .eq("user_id", user_id)
        .eq("alert_type", "skipped")
        .single();

      const recipientsRaw: string[] = (() => {
        try { return JSON.parse(skippedSettings?.recipients || "[]"); } catch { return []; }
      })();
      const recipients = recipientsRaw.map((p: string) => p.replace(/\D/g, "")).filter((p: string) => p.length >= 10);
      if (!recipients.length) {
        return new Response(JSON.stringify({ skipped: "no recipient phones configured" }), { headers: cors });
      }

      const { data: svcs } = await supabase.from("Services").select("*").in("id", service_ids);
      if (!svcs?.length) return new Response(JSON.stringify({ skipped: "no services found" }), { headers: cors });

      const skippedResults: any[] = [];
      const didClean = (twilio.phone_number as string).replace(/\D/g, "");

      for (const svc of svcs) {
        let addr  = svc.address || "";
        let truck = svc.truck || svc.assigned_truck || svc.vehicle || "";
        if (svc.property_id) {
          const { data: prop } = await supabase.from("Properties").select("address").eq("id", svc.property_id).single();
          if (prop) addr = prop.address || addr;
        }

        const msg = subVars(msgTemplate, {
          propertyaddress: addr,
          propertycity: "", propertystate: "", propertyzip: "",
          truck,
          scheduledservices: svc.service || "",
          clientname:        svc.client_name || "",
          servicedate:       svc.scheduled_date || "",
          skipnote:          skip_note || "",
          companyname:       companyName,
        });

        const parts: string[] = [];
        let rem = msg;
        while (rem.length > 0 && parts.length < 3) {
          if (rem.length <= 160) { parts.push(rem); break; }
          let cut = 160;
          while (cut > 0 && rem[cut] !== " " && rem[cut] !== "\n") cut--;
          if (cut === 0) cut = 160;
          parts.push(rem.substring(0, cut).trimEnd());
          rem = rem.substring(cut).trimStart();
        }

        for (const recipPhone of recipients) {
          const toClean = recipPhone.length === 10 ? "1" + recipPhone : recipPhone;
          let lastStatus = "success";
          for (const part of parts) {
            const voipUrl = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(twilio.account_sid)}&api_password=${encodeURIComponent(twilio.auth_token)}&method=sendSMS&did=${didClean}&dst=${toClean}&message=${encodeURIComponent(part)}`;
            const vr = await fetch(voipUrl);
            const vj = await vr.json();
            if (vj.status !== "success") lastStatus = vj.status;
          }
          skippedResults.push({ channel: "sms", to: "+" + toClean, status: lastStatus });
          await supabase.from("sms_messages").insert({
            user_id, client_name: "Team Alert", phone_to: "+" + toClean,
            phone_from: twilio.phone_number, body: msg, direction: "outbound",
            twilio_sid: null, alert_type, sent_at: new Date().toISOString(),
          });
        }
      }

      return new Response(JSON.stringify({ results: skippedResults }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SERVICE ALERT FLOW  (scheduled / reschedule / completed / mobile)
    // ─────────────────────────────────────────────────────────────────────────
    const { data: svcs } = await supabase.from("Services").select("*").in("id", service_ids);
    if (!svcs?.length) return new Response(JSON.stringify({ skipped: "no services found" }), { headers: cors });

    const byProperty: Record<string, { property_id: string; services: any[] }> = {};
    for (const svc of svcs) {
      const key = svc.property_id || String(svc.id);
      if (!byProperty[key]) byProperty[key] = { property_id: svc.property_id, services: [] };
      byProperty[key].services.push(svc);
    }

    const results: any[] = [];

    for (const key of Object.keys(byProperty)) {
      const group = byProperty[key];
      if (!group.property_id) continue;
      const svc = group.services[0];

      const { data: prop } = await supabase.from("Properties").select("*").eq("id", group.property_id).single();
      if (!prop) continue;

      let client: any = null;
      const clientId = prop.customer_id || prop.client_id || svc.customer_id;
      if (clientId) {
        const { data: cl } = await supabase.from("Clients").select("*").eq("id", clientId).single();
        client = cl;
      }

      const toPhone = (client?.phone || client?.mobile || client?.cell || prop.phone || prop.mobile || prop.cell || "").replace(/\D/g, "");
      const toEmail = client?.email || prop.email || "";
      const formatted = toPhone.length === 10 ? "+1" + toPhone : toPhone.length === 11 ? "+" + toPhone : toPhone;

      const serviceList = group.services.map((s: any) => s.service || "").filter(Boolean).join(", ");

      // Invoice name lookup
      const psIds = group.services.map((s: any) => s.package_service_id).filter(Boolean);
      let invoiceNameMap: Record<string, string> = {};
      if (psIds.length) {
        const { data: psRows } = await supabase.from("package_services").select("id, name").in("id", psIds);
        (psRows || []).forEach((ps: any) => { if (ps.id && ps.name) invoiceNameMap[String(ps.id)] = ps.name; });
      }
      const oneTimeSvcNames = group.services.filter((s: any) => !s.package_service_id && s.service).map((s: any) => s.service).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
      let oneTimeMap: Record<string, string> = {};
      if (oneTimeSvcNames.length) {
        const { data: otRows } = await supabase.from("Services").select("name, invoice_name").in("name", oneTimeSvcNames).is("property_id", null).not("invoice_name", "is", null);
        (otRows || []).forEach((r: any) => { if (r.invoice_name) oneTimeMap[r.name] = r.invoice_name; });
      }
      const invoiceServiceList = group.services.map((s: any) => {
        if (s.package_service_id) return invoiceNameMap[String(s.package_service_id)] || s.service || "";
        return oneTimeMap[s.service] || s.service || "";
      }).filter(Boolean).join(", ");

      const firstName = client?.first_name || prop.first_name || "";
      const lastName  = client?.last_name  || prop.last_name  || "";

      const msg = subVars(msgTemplate, {
        clientname:      (firstName + " " + lastName).trim(),
        clientfirstname: firstName,
        clientlastname:  lastName,
        clientphone:     client?.phone || prop.phone || "",
        clientemail:     client?.email || prop.email || "",
        propertyaddress: prop.address || svc.address || "",
        propertycity:    prop.city || "",
        propertystate:   prop.state || "",
        propertyzip:     prop.zip || "",
        scheduledservices: serviceList,
        completedservices: serviceList,
        scheduledservicesnameoninvoice: invoiceServiceList,
        servicedate:     svc.scheduled_date || "",
        servicetime:     "",
        servicetype:     svc.service || "",
        servicenotes:    svc.notes || "",
        serviceprice:    svc.amount ? "$" + parseFloat(svc.amount).toFixed(2) : "",
        servicetech:     svc.assigned_to || "",
        serviceproducts: svc.service || "",
        newservicedate:  svc.scheduled_date || "",
        newservicetime:  "",
        cancelreason:    "",
        companyname:     companyName,
        companyphone:    company?.phone || "",
        companyemail:    company?.email || "",
        companywebsite:  company?.website || "",
        companyaddress:  company?.phys_address || company?.address || "",
      });

      if (canSms && formatted.length >= 10) {
        const status = await sendSms(formatted, msg);
        results.push({ channel: "sms", to: formatted, status, error: status !== "success" ? status : null });
        await supabase.from("sms_messages").insert({
          user_id,
          client_name: (firstName + " " + lastName).trim() || svc.client_name || "",
          phone_to: formatted, phone_from: twilio.phone_number,
          body: msg, direction: "outbound", twilio_sid: null,
          alert_type, sent_at: new Date().toISOString(),
        });
      }

      if (canEmail && toEmail) {
        const r = await sendEmail(toEmail, msg);
        results.push({ channel: "email", to: toEmail, ...r });
      } else if (canEmail && !toEmail) {
        results.push({ channel: "email", skipped: "no_client_email" });
      }
    }

    return new Response(JSON.stringify({ results, _debug: { user_id, ownerUserId, alert_type, toggles, toggleErr: toggleErr?.message, emailEnabled, canEmail, resendKeySet: !!resendKey } }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
