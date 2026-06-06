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

const RESEND_API_KEY = "re_apd6qCQb_LerK8x5aS84YU4J7jj6WarnM";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { invoice_id, mark_only, invoice_ids } = body;

    // mark_only mode: just set status_text = 'Sent' for an array of IDs, no email
    if (mark_only && invoice_ids && invoice_ids.length) {
      const { data: updData, error: updErr } = await supabase.from("Invoices").update({ status_text: "Sent" }).in("id", invoice_ids).select("id, status_text");
      console.log("mark_only update ids:", invoice_ids, "result:", updData, "error:", updErr);
      if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true, updated: updData }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (!invoice_id) return new Response(JSON.stringify({ error: "Missing invoice_id" }), { status: 400, headers: CORS });

    // Load invoice
    const { data: inv, error: invErr } = await supabase.from("Invoices").select("*").eq("id", invoice_id).single();
    if (invErr || !inv) return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: CORS });

    // Load company info for sender name
    const { data: co } = await supabase.from("company_info").select("company_name, display_name").eq("user_id", inv.user_id).single();
    const compName = co?.display_name || co?.company_name || "SprayBossPro";

    // Find client email: try property → client chain, then search Clients by name
    let toEmail = "";

    if (inv.property_id) {
      const { data: prop } = await supabase.from("Properties").select("customer_id").eq("id", inv.property_id).single();
      if (prop?.customer_id) {
        const { data: cl } = await supabase.from("Clients").select("email").eq("id", prop.customer_id).single();
        toEmail = cl?.email || "";
      }
    }

    if (!toEmail && inv.client_name) {
      const { data: cl } = await supabase.from("Clients").select("email").ilike("name", inv.client_name).limit(1).single();
      toEmail = cl?.email || "";
    }

    if (!toEmail) return new Response(JSON.stringify({ error: "No email address on file for this client." }), { status: 400, headers: CORS });

    // Format line items table
    const lines: any[] = Array.isArray(inv.service_lines) ? inv.service_lines : [];
    const lineRows = lines.map(function(l: any) {
      const amt = parseFloat(l.amount || 0).toFixed(2);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${l.name || l.description || ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${l.qty || 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${parseFloat(l.rate || 0).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${amt}</td>
      </tr>`;
    }).join("");

    const total = "$" + parseFloat(inv.inv_total || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const invNum = inv.inv_num ? "#" + inv.inv_num : "Invoice";
    const invDate = inv.date || "";
    const dueDate = inv.due_date || "";

    const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;color:#222;">
  <div style="background:#3a3a3a;padding:20px 28px;border-radius:4px 4px 0 0;">
    <div style="color:#fff;font-size:22px;font-weight:800;">${compName}</div>
    <div style="color:#e07820;font-size:16px;font-weight:700;margin-top:4px;">Invoice ${invNum}</div>
  </div>
  <div style="background:#fff;border:1px solid #e0e0e0;border-top:none;padding:24px 28px;border-radius:0 0 4px 4px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Billed To</div>
        <div style="font-weight:700;font-size:15px;">${inv.client_name || ""}</div>
        <div style="color:#666;font-size:13px;">${inv.address || ""}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Details</div>
        ${invDate ? `<div style="font-size:13px;"><strong>Date:</strong> ${invDate}</div>` : ""}
        ${dueDate ? `<div style="font-size:13px;"><strong>Due:</strong> ${dueDate}</div>` : ""}
      </div>
    </div>
    ${lines.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#555;">Service</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#555;">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#555;">Rate</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#555;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>` : ""}
    <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
      <div style="min-width:200px;">
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-top:2px solid #222;font-size:16px;font-weight:800;">
          <span>Total</span><span>${total}</span>
        </div>
      </div>
    </div>
    ${inv.notes ? `<div style="background:#f9f9f9;border-radius:4px;padding:12px 16px;font-size:13px;color:#555;margin-bottom:16px;"><strong>Notes:</strong> ${inv.notes}</div>` : ""}
    <div style="font-size:12px;color:#aaa;text-align:center;margin-top:8px;">Thank you for your business!</div>
  </div>
</div>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: compName + " <Mail@spraybosspro.com>",
        to: [toEmail],
        subject: `Invoice from ${compName}`,
        html: html,
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) throw new Error("Resend " + resendRes.status + ": " + (resendData.message || JSON.stringify(resendData)));

    // Mark as emailed
    await supabase.from("Invoices").update({ to_email: false, status_text: "Sent" }).eq("id", invoice_id);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
