import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { alert_type, service_ids, user_id, alert_message } = await req.json();
    if (!alert_type || !service_ids?.length || !user_id) {
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
      let invoiceNameMap: Record<string, string> = {};
      if (psIds.length) {
        const { data: psRows } = await supabase
          .from("package_services")
          .select("id, name")
          .in("id", psIds);
        (psRows || []).forEach((ps: any) => {
          if (ps.id && ps.name) invoiceNameMap[String(ps.id)] = ps.name;
        });
      }
      const invoiceServiceList = group.services
        .map((s: any) => (s.package_service_id && invoiceNameMap[String(s.package_service_id)]) || s.service || "")
        .filter(Boolean)
        .join(", ");

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
      sub("schedulednameoninvoices", invoiceServiceList);
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

      // Send SMS via voip.ms
      const toClean = formattedPhone.replace(/^\+/, "");
      const didClean = twilio.phone_number.replace(/\D/g, "");
      const voipUrl = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(twilio.account_sid)}&api_password=${encodeURIComponent(twilio.auth_token)}&method=sendSMS&did=${didClean}&dst=${toClean}&message=${encodeURIComponent(msg)}`;

      const voipRes = await fetch(voipUrl);
      const voipJson = await voipRes.json();
      const success = voipJson.status === "success";
      results.push({ to: formattedPhone, status: voipJson.status, error: success ? null : voipJson.status });

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
