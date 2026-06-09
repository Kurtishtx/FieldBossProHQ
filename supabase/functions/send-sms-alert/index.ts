import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Use client-provided message if sent, otherwise fall back to DB lookup
    let alertSettings: any = null;
    if (alert_message) {
      alertSettings = { enabled: true, message: alert_message };
    } else {
      const { data: alertRows } = await supabase
        .from("alert_settings")
        .select("enabled, message")
        .eq("user_id", user_id)
        .eq("alert_type", alert_type)
        .limit(1);
      alertSettings = alertRows && alertRows.length > 0 ? alertRows[0] : null;
    }

    if (!alertSettings?.enabled || !alertSettings?.message) {
      return new Response(JSON.stringify({ skipped: "alert disabled or no message", found: alertSettings }), { headers: cors });
    }

    // Load voip.ms credentials
    const { data: twilio } = await supabase
      .from("twilio_settings")
      .select("account_sid, auth_token, phone_number")
      .eq("user_id", user_id)
      .single();

    if (!twilio?.account_sid || !twilio?.auth_token || !twilio?.phone_number) {
      return new Response(JSON.stringify({ error: "voip.ms not configured for this account" }), { headers: cors });
    }

    // Load company info
    const { data: company } = await supabase
      .from("company_info")
      .select("*")
      .eq("user_id", user_id)
      .single();

    // --- Estimate alert flow ---
    if (estimate_id) {
      const { data: est } = await supabase.from("estimates").select("*").eq("id", estimate_id).single();
      if (!est) return new Response(JSON.stringify({ skipped: "estimate not found" }), { headers: cors });

      const { data: company } = await supabase.from("company_info").select("*").eq("user_id", user_id).single();

      let clientName = est.client_name || "";
      let firstName = clientName.split(" ")[0] || "";
      let lastName  = clientName.split(" ").slice(1).join(" ") || "";
      let phone = "";

      if (est.customer_id) {
        const { data: lead } = await supabase.from("Leads").select("name, phone, first_name, last_name").eq("id", est.customer_id).single();
        if (lead) {
          firstName = lead.first_name || lead.name?.split(" ")[0] || firstName;
          lastName  = lead.last_name  || lead.name?.split(" ").slice(1).join(" ") || lastName;
          phone = (lead.phone || "").replace(/\D/g, "");
        }
        if (!phone) {
          const { data: cl } = await supabase.from("Clients").select("phone, first_name, last_name").eq("id", est.customer_id).single();
          if (cl) {
            firstName = cl.first_name || firstName;
            lastName  = cl.last_name  || lastName;
            phone = (cl.phone || "").replace(/\D/g, "");
          }
        }
      }

      const formattedPhone = phone.length === 10 ? "+1" + phone : phone.length === 11 ? "+" + phone : phone;
      if (!formattedPhone || formattedPhone.length < 10) {
        return new Response(JSON.stringify({ skipped: "no phone number found" }), { headers: cors });
      }

      let msg: string = alertSettings.message;
      const sub = (tag: string, val: string) => { msg = msg.split(`[${tag}]`).join(val || ""); };
      sub("clientname",      (firstName + " " + lastName).trim());
      sub("clientfirstname", firstName);
      sub("clientlastname",  lastName);
      sub("estimateamount",  est.amount ? "$" + parseFloat(est.amount).toFixed(2) : "");
      sub("estimatenumber",  est.estimate_number ? String(est.estimate_number) : "");
      sub("companyname",     company?.company_name || company?.display_name || "");
      sub("companyphone",    company?.phone || "");
      sub("companywebsite",  company?.website || "");

      const parts: string[] = [];
      let remaining = msg;
      while (remaining.length > 0 && parts.length < 3) {
        if (remaining.length <= 160) { parts.push(remaining); break; }
        let cut = 160;
        while (cut > 0 && remaining[cut] !== " " && remaining[cut] !== "\n") cut--;
        if (cut === 0) cut = 160;
        parts.push(remaining.substring(0, cut).trimEnd());
        remaining = remaining.substring(cut).trimStart();
      }

      const toClean  = formattedPhone.replace(/^\+/, "");
      const didClean = twilio.phone_number.replace(/\D/g, "");
      let lastStatus = "success";
      for (const part of parts) {
        const voipUrl = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(twilio.account_sid)}&api_password=${encodeURIComponent(twilio.auth_token)}&method=sendSMS&did=${didClean}&dst=${toClean}&message=${encodeURIComponent(part)}`;
        const vr = await fetch(voipUrl);
        const vj = await vr.json();
        if (vj.status !== "success") lastStatus = vj.status;
      }

      await supabase.from("sms_messages").insert({
        user_id, client_name: (firstName + " " + lastName).trim(), phone_to: formattedPhone,
        phone_from: twilio.phone_number, body: msg, direction: "outbound",
        twilio_sid: null, alert_type, sent_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ results: [{ to: formattedPhone, status: lastStatus, error: lastStatus !== "success" ? lastStatus : null }] }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // --- Skipped alert flow (employee alert) ---
    if (alert_type === "skipped") {
      // Load recipients from alert_settings
      const { data: skippedSettings } = await supabase
        .from("alert_settings")
        .select("enabled, message, recipients")
        .eq("user_id", user_id)
        .eq("alert_type", "skipped")
        .single();

      if (!skippedSettings?.enabled) {
        return new Response(JSON.stringify({ skipped: "skipped alert disabled" }), { headers: cors });
      }
      const recipientsRaw: string[] = (() => {
        try { return JSON.parse(skippedSettings.recipients || "[]"); } catch { return []; }
      })();
      const recipients = recipientsRaw.map((p: string) => p.replace(/\D/g, "")).filter((p: string) => p.length >= 10);
      if (!recipients.length) {
        return new Response(JSON.stringify({ skipped: "no recipient phones configured" }), { headers: cors });
      }

      const { data: svcs } = await supabase.from("Services").select("*").in("id", service_ids);
      if (!svcs?.length) {
        return new Response(JSON.stringify({ skipped: "no services found" }), { headers: cors });
      }

      const skippedResults: any[] = [];
      const msgTemplate: string = skippedSettings.message || alertSettings?.message || "";
      const didClean = twilio.phone_number.replace(/\D/g, "");

      for (const svc of svcs) {
        let addr = svc.address || "";
        let truck = svc.truck || svc.assigned_truck || svc.vehicle || "";
        if (svc.property_id) {
          const { data: prop } = await supabase.from("Properties").select("address, city, state").eq("id", svc.property_id).single();
          if (prop) addr = prop.address || addr;
        }

        let msg = msgTemplate;
        const sub = (tag: string, val: string) => { msg = msg.split(`[${tag}]`).join(val || ""); };
        sub("propertyaddress", addr);
        sub("propertycity",    "");
        sub("propertystate",   "");
        sub("propertyzip",     "");
        sub("truck",           truck);
        sub("scheduledservices", svc.service || "");
        sub("clientname",      svc.client_name || "");
        sub("servicedate",     svc.scheduled_date || "");
        sub("skipnote",        skip_note || "");
        sub("companyname",     company?.company_name || company?.display_name || "");

        const parts: string[] = [];
        let remaining = msg;
        while (remaining.length > 0 && parts.length < 3) {
          if (remaining.length <= 160) { parts.push(remaining); break; }
          let cut = 160;
          while (cut > 0 && remaining[cut] !== " " && remaining[cut] !== "\n") cut--;
          if (cut === 0) cut = 160;
          parts.push(remaining.substring(0, cut).trimEnd());
          remaining = remaining.substring(cut).trimStart();
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
          skippedResults.push({ to: "+" + toClean, status: lastStatus, error: lastStatus !== "success" ? lastStatus : null });

          await supabase.from("sms_messages").insert({
            user_id, client_name: "Team Alert", phone_to: "+" + toClean,
            phone_from: twilio.phone_number, body: msg, direction: "outbound",
            twilio_sid: null, alert_type, sent_at: new Date().toISOString(),
          });
        }
      }

      return new Response(JSON.stringify({ results: skippedResults }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // --- Service alert flow ---
    // Load services
    const { data: svcs } = await supabase
      .from("Services")
      .select("*")
      .in("id", service_ids);

    if (!svcs?.length) {
      return new Response(JSON.stringify({ skipped: "no services found" }), { headers: cors });
    }

    // Group services by property so one SMS goes per property
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

      // Load property
      const { data: prop } = await supabase
        .from("Properties")
        .select("*")
        .eq("id", group.property_id)
        .single();

      if (!prop) continue;

      // Load client — try property first, fall back to service
      let client: any = null;
      const clientId = prop.customer_id || prop.client_id || svc.customer_id;
      if (clientId) {
        const { data: cl } = await supabase
          .from("Clients")
          .select("*")
          .eq("id", clientId)
          .single();
        client = cl;
        console.log("client lookup:", clientId, "found:", !!cl, "phone:", cl?.phone || cl?.mobile || cl?.cell);
      } else {
        console.log("no clientId found — prop.customer_id:", prop.customer_id, "svc.customer_id:", svc.customer_id);
      }

      // Find phone number
      const toPhone: string = (
        client?.phone || client?.mobile || client?.cell ||
        prop.phone || prop.mobile || prop.cell || ""
      ).replace(/\D/g, ""); // strip non-digits

      const formattedPhone = toPhone.length === 10 ? "+1" + toPhone :
                             toPhone.length === 11 ? "+" + toPhone : toPhone;

      if (!formattedPhone || formattedPhone.length < 10) continue;

      // Build comma-separated service list
      const serviceList = group.services
        .map((s: any) => s.service || "")
        .filter(Boolean)
        .join(", ");

      // Build invoice name list (from package_services.name)
      const psIds = group.services
        .map((s: any) => s.package_service_id)
        .filter(Boolean);
      console.log("psIds for invoice lookup:", psIds, "services:", group.services.map((s: any) => ({ id: s.id, service: s.service, package_service_id: s.package_service_id })));
      let invoiceNameMap: Record<string, string> = {};
      if (psIds.length) {
        const { data: psRows, error: psErr } = await supabase
          .from("package_services")
          .select("id, name")
          .in("id", psIds);
        console.log("package_services rows:", psRows, "error:", psErr);
        (psRows || []).forEach((ps: any) => {
          if (ps.id && ps.name) invoiceNameMap[String(ps.id)] = ps.name;
        });
      }
      const invoiceServiceList = group.services
        .map((s: any) => (s.package_service_id && invoiceNameMap[String(s.package_service_id)]) || s.service || "")
        .filter(Boolean)
        .join(", ");
      console.log("invoiceServiceList:", invoiceServiceList);

      // Substitute all [variables]
      let msg: string = alertSettings.message;
      const sub = (tag: string, val: string) => {
        msg = msg.split(`[${tag}]`).join(val || "");
      };

      const firstName = client?.first_name || prop.first_name || "";
      const lastName  = client?.last_name  || prop.last_name  || "";

      sub("clientname",      (firstName + " " + lastName).trim());
      sub("clientfirstname", firstName);
      sub("clientlastname",  lastName);
      sub("clientphone",     client?.phone || prop.phone || "");
      sub("clientemail",     client?.email || prop.email || "");

      sub("propertyaddress", prop.address || svc.address || "");
      sub("propertycity",    prop.city || "");
      sub("propertystate",   prop.state || "");
      sub("propertyzip",     prop.zip || "");

      sub("scheduledservices", serviceList);
      sub("completedservices", serviceList);
      sub("scheduledservicesnameoninvoice", invoiceServiceList);
      sub("servicedate",       svc.scheduled_date || "");
      sub("servicetime",       "");
      sub("servicetype",       svc.service || "");
      sub("servicenotes",      svc.notes || "");
      sub("serviceprice",      svc.amount ? "$" + parseFloat(svc.amount).toFixed(2) : "");
      sub("servicetech",       svc.assigned_to || "");
      sub("serviceproducts",   svc.service || "");

      sub("newservicedate", svc.scheduled_date || "");
      sub("newservicetime", "");
      sub("cancelreason",   "");

      sub("companyname",    company?.company_name || company?.display_name || "");
      sub("companyphone",   company?.phone || "");
      sub("companyemail",   company?.email || "");
      sub("companywebsite", company?.website || "");
      sub("companyaddress", company?.phys_address || company?.address || "");

      // Split into up to 3 messages of 160 chars each at word boundaries
      const parts: string[] = [];
      let remaining = msg;
      while (remaining.length > 0 && parts.length < 3) {
        if (remaining.length <= 160) { parts.push(remaining); break; }
        let cut = 160;
        while (cut > 0 && remaining[cut] !== " " && remaining[cut] !== "\n") cut--;
        if (cut === 0) cut = 160;
        parts.push(remaining.substring(0, cut).trimEnd());
        remaining = remaining.substring(cut).trimStart();
      }

      // Send SMS via voip.ms (one call per part)
      const toClean = formattedPhone.replace(/^\+/, "");
      const didClean = twilio.phone_number.replace(/\D/g, "");
      let lastStatus = "success";
      for (const part of parts) {
        const voipUrl = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(twilio.account_sid)}&api_password=${encodeURIComponent(twilio.auth_token)}&method=sendSMS&did=${didClean}&dst=${toClean}&message=${encodeURIComponent(part)}`;
        const voipRes = await fetch(voipUrl);
        const voipJson = await voipRes.json();
        if (voipJson.status !== "success") lastStatus = voipJson.status;
      }
      const success = lastStatus === "success";
      results.push({ to: formattedPhone, status: lastStatus, error: success ? null : lastStatus, parts: parts.length });

      // Log message to sms_messages table
      await supabase.from("sms_messages").insert({
        user_id,
        client_name: (firstName + " " + lastName).trim() || svc.client_name || "",
        phone_to: formattedPhone,
        phone_from: twilio.phone_number,
        body: msg,
        direction: "outbound",
        twilio_sid: null,
        alert_type,
        sent_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
