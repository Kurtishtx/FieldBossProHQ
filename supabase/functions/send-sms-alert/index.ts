import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { alert_type, service_ids, user_id } = await req.json();
    if (!alert_type || !service_ids?.length || !user_id) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load alert template
    const { data: alertSettings } = await supabase
      .from("alert_settings")
      .select("enabled, message")
      .eq("user_id", user_id)
      .eq("alert_type", alert_type)
      .single();

    if (!alertSettings?.enabled || !alertSettings?.message) {
      return new Response(JSON.stringify({ skipped: "alert disabled or no message" }), { headers: cors });
    }

    // Load Twilio credentials
    const { data: twilio } = await supabase
      .from("twilio_settings")
      .select("account_sid, auth_token, phone_number")
      .eq("user_id", user_id)
      .single();

    if (!twilio?.account_sid || !twilio?.auth_token || !twilio?.phone_number) {
      return new Response(JSON.stringify({ error: "Twilio not configured for this account" }), { headers: cors });
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

      // Load property
      const { data: prop } = await supabase
        .from("Properties")
        .select("*")
        .eq("id", group.property_id)
        .single();

      if (!prop) continue;

      // Load client
      let client: any = null;
      const clientId = prop.customer_id || prop.client_id;
      if (clientId) {
        const { data: cl } = await supabase
          .from("Clients")
          .select("*")
          .eq("id", clientId)
          .single();
        client = cl;
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

      const svc = group.services[0];

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

      // Send SMS via Twilio
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio.account_sid}/Messages.json`;
      const body = new URLSearchParams({ To: formattedPhone, From: twilio.phone_number, Body: msg });

      const twilioRes = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${twilio.account_sid}:${twilio.auth_token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const twilioJson = await twilioRes.json();
      results.push({ to: formattedPhone, sid: twilioJson.sid, status: twilioJson.status, error: twilioJson.message });

      // Log message to sms_messages table
      await supabase.from("sms_messages").insert({
        user_id,
        client_name: (firstName + " " + lastName).trim() || svc.client_name || "",
        phone_to: formattedPhone,
        phone_from: twilio.phone_number,
        body: msg,
        direction: "outbound",
        twilio_sid: twilioJson.sid || null,
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
