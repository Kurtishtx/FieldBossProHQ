import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Build styled HTML email from alert_email_settings + body text ──────────
function buildEmailHtml(style: number, info: any, bodyText: string): string {
  const e = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Styles 1-36:   9 original palettes × 4 layouts  → li=(s-1)%4,  pi=floor((s-1)/4)
  // Styles 37-45:  name banner for original palettes → li=4, pi=s-37
  // Styles 46-90:  9 new palettes × 5 layouts       → li=(s-46)%5, pi=9+floor((s-46)/5)
  // Styles 91-99:  dark name banner for original 9   → li=5, pi=s-91
  // Styles 100-108:dark name banner for new 9        → li=5, pi=9+(s-100)
  let li: number, pi: number;
  if (style >= 100) {
    li = 5;
    pi = 9 + (style - 100);
  } else if (style >= 91) {
    li = 5;
    pi = style - 91;
  } else if (style >= 46) {
    li = (style - 46) % 5;
    pi = 9 + Math.floor((style - 46) / 5);
  } else if (style >= 37) {
    li = 4;
    pi = style - 37;
  } else {
    li = (style - 1) % 4;
    pi = Math.floor((style - 1) / 4);
  }

  const P: any[] = [
    { sCo:"#5b2d8e", sDiv:"#ede7f6", sFbg:"#f9f4ff", sFbd:"#ede7f6", sFtx:"#5b2d8e",
      dWbg:"#0e0e0e", dHbg:"#1a1a1a", dAcc:"#e07820", dCo:"#e07820", dFtx:"#e07820",
      bHg1:"#3d1060", bHg2:"#6b21a8", bFbg:"#f5f5f5", bFbd:"#ddd",  bFtx:"#3d1060",
      nWbg:"#0e0e0e", nHbg:"#1a1a1a", nAcc:"#e07820", nFtx:"#e07820",
      nbHbg:"#5b2d8e", nbCo:"#fff", nbdBg:"#0e0e0e", nbdFbg:"#1a1a1a", nbdBd:"#e07820", nbdTx:"#e07820" },
    { sCo:"#0369a1", sDiv:"#bae6fd", sFbg:"#f0f9ff", sFbd:"#bae6fd", sFtx:"#0369a1",
      dWbg:"#071e38", dHbg:"#0c2744", dAcc:"#06b6d4", dCo:"#06b6d4", dFtx:"#06b6d4",
      bHg1:"#0c4a6e", bHg2:"#0369a1", bFbg:"#f0f9ff", bFbd:"#bae6fd", bFtx:"#0c4a6e",
      nWbg:"#071e38", nHbg:"#0c2744", nAcc:"#06b6d4", nFtx:"#06b6d4",
      nbHbg:"#0369a1", nbCo:"#fff", nbdBg:"#071e38", nbdFbg:"#0c2744", nbdBd:"#06b6d4", nbdTx:"#06b6d4" },
    { sCo:"#166534", sDiv:"#bbf7d0", sFbg:"#f0fdf4", sFbd:"#bbf7d0", sFtx:"#166534",
      dWbg:"#0a150e", dHbg:"#122018", dAcc:"#ca8a04", dCo:"#ca8a04", dFtx:"#ca8a04",
      bHg1:"#14532d", bHg2:"#166534", bFbg:"#f0fdf4", bFbd:"#bbf7d0", bFtx:"#14532d",
      nWbg:"#0a150e", nHbg:"#122018", nAcc:"#ca8a04", nFtx:"#ca8a04",
      nbHbg:"#166534", nbCo:"#fff", nbdBg:"#0a150e", nbdFbg:"#122018", nbdBd:"#ca8a04", nbdTx:"#ca8a04" },
    { sCo:"#991b1b", sDiv:"#fecdd3", sFbg:"#fff1f2", sFbd:"#fecdd3", sFtx:"#7f1d1d",
      dWbg:"#1a0808", dHbg:"#2a0e0e", dAcc:"#dc2626", dCo:"#dc2626", dFtx:"#dc2626",
      bHg1:"#7f1d1d", bHg2:"#991b1b", bFbg:"#fff1f2", bFbd:"#fecdd3", bFtx:"#7f1d1d",
      nWbg:"#1a0808", nHbg:"#2a0e0e", nAcc:"#dc2626", nFtx:"#dc2626",
      nbHbg:"#991b1b", nbCo:"#fff", nbdBg:"#1a0808", nbdFbg:"#2a0e0e", nbdBd:"#dc2626", nbdTx:"#dc2626" },
    { sCo:"#334155", sDiv:"#cbd5e1", sFbg:"#f8fafc", sFbd:"#cbd5e1", sFtx:"#334155",
      dWbg:"#0f172a", dHbg:"#1e293b", dAcc:"#64748b", dCo:"#94a3b8", dFtx:"#94a3b8",
      bHg1:"#1e293b", bHg2:"#334155", bFbg:"#f8fafc", bFbd:"#cbd5e1", bFtx:"#334155",
      nWbg:"#0f172a", nHbg:"#1e293b", nAcc:"#64748b", nFtx:"#94a3b8",
      nbHbg:"#334155", nbCo:"#fff", nbdBg:"#0f172a", nbdFbg:"#1e293b", nbdBd:"#64748b", nbdTx:"#94a3b8" },
    { sCo:"#92400e", sDiv:"#fde68a", sFbg:"#fffbeb", sFbd:"#fde68a", sFtx:"#92400e",
      dWbg:"#1a0e00", dHbg:"#291600", dAcc:"#f59e0b", dCo:"#f59e0b", dFtx:"#f59e0b",
      bHg1:"#78350f", bHg2:"#b45309", bFbg:"#fffbeb", bFbd:"#fde68a", bFtx:"#78350f",
      nWbg:"#1a0e00", nHbg:"#291600", nAcc:"#f59e0b", nFtx:"#f59e0b",
      nbHbg:"#b45309", nbCo:"#fff", nbdBg:"#1a0e00", nbdFbg:"#291600", nbdBd:"#f59e0b", nbdTx:"#f59e0b" },
    { sCo:"#1d4ed8", sDiv:"#bfdbfe", sFbg:"#eff6ff", sFbd:"#bfdbfe", sFtx:"#ca8a04",
      dWbg:"#080d1f", dHbg:"#0d1640", dAcc:"#3b82f6", dCo:"#fbbf24", dFtx:"#fbbf24",
      bHg1:"#1e3a8a", bHg2:"#1d4ed8", bFbg:"#eff6ff", bFbd:"#bfdbfe", bFtx:"#ca8a04",
      nWbg:"#080d1f", nHbg:"#0d1640", nAcc:"#3b82f6", nFtx:"#fbbf24",
      nbHbg:"#1d4ed8", nbCo:"#fbbf24", nbdBg:"#080d1f", nbdFbg:"#0d1640", nbdBd:"#3b82f6", nbdTx:"#fbbf24" },
    { sCo:"#065f46", sDiv:"#a7f3d0", sFbg:"#ecfdf5", sFbd:"#a7f3d0", sFtx:"#ea580c",
      dWbg:"#020e08", dHbg:"#041f12", dAcc:"#10b981", dCo:"#f97316", dFtx:"#f97316",
      bHg1:"#064e3b", bHg2:"#065f46", bFbg:"#ecfdf5", bFbd:"#a7f3d0", bFtx:"#ea580c",
      nWbg:"#020e08", nHbg:"#041f12", nAcc:"#10b981", nFtx:"#f97316",
      nbHbg:"#065f46", nbCo:"#f97316", nbdBg:"#020e08", nbdFbg:"#041f12", nbdBd:"#10b981", nbdTx:"#f97316" },
    { sCo:"#4338ca", sDiv:"#c7d2fe", sFbg:"#eef2ff", sFbd:"#c7d2fe", sFtx:"#db2777",
      dWbg:"#0d0a2e", dHbg:"#1a1550", dAcc:"#6366f1", dCo:"#f472b6", dFtx:"#f472b6",
      bHg1:"#312e81", bHg2:"#4338ca", bFbg:"#eef2ff", bFbd:"#c7d2fe", bFtx:"#db2777",
      nWbg:"#0d0a2e", nHbg:"#1a1550", nAcc:"#6366f1", nFtx:"#f472b6",
      nbHbg:"#4338ca", nbCo:"#f472b6", nbdBg:"#0d0a2e", nbdFbg:"#1a1550", nbdBd:"#6366f1", nbdTx:"#f472b6" },
    // ── 9 new palettes (styles 46-90) ─────────────────────────────────────
    { sCo:"#d97706", sDiv:"#fde68a", sFbg:"#fffde7", sFbd:"#fde68a", sFtx:"#d97706",
      dWbg:"#0a0a0a", dHbg:"#1c1c1c", dAcc:"#eab308", dCo:"#eab308", dFtx:"#eab308",
      bHg1:"#111111", bHg2:"#252525", bFbg:"#fffde7", bFbd:"#fde68a", bFtx:"#92400e",
      nWbg:"#0a0a0a", nHbg:"#111111", nAcc:"#eab308", nFtx:"#eab308",
      nbHbg:"#111111", nbCo:"#eab308", nbdBg:"#0a0a0a", nbdFbg:"#1c1c1c", nbdBd:"#eab308", nbdTx:"#eab308",
      nbdHbg:"#eab308", nbdCo:"#111111" },
    { sCo:"#1d4ed8", sDiv:"#bfdbfe", sFbg:"#fff1f2", sFbd:"#fecdd3", sFtx:"#dc2626",
      dWbg:"#080c1f", dHbg:"#0d1640", dAcc:"#dc2626", dCo:"#60a5fa", dFtx:"#60a5fa",
      bHg1:"#991b1b", bHg2:"#dc2626", bFbg:"#eff6ff", bFbd:"#bfdbfe", bFtx:"#1d4ed8",
      nWbg:"#080c1f", nHbg:"#0d1640", nAcc:"#dc2626", nFtx:"#f87171",
      nbHbg:"#1d4ed8", nbCo:"#fff", nbdBg:"#080c1f", nbdFbg:"#0d1640", nbdBd:"#dc2626", nbdTx:"#60a5fa" },
    { sCo:"#7c3aed", sDiv:"#e9d5ff", sFbg:"#fff7ed", sFbd:"#fed7aa", sFtx:"#ea580c",
      dWbg:"#0d0020", dHbg:"#1e0a3c", dAcc:"#f97316", dCo:"#f97316", dFtx:"#f97316",
      bHg1:"#1e0a3c", bHg2:"#3b0764", bFbg:"#fff7ed", bFbd:"#fed7aa", bFtx:"#c2410c",
      nWbg:"#0d0020", nHbg:"#1e0a3c", nAcc:"#f97316", nFtx:"#f97316",
      nbHbg:"#1e0a3c", nbCo:"#f97316", nbdBg:"#0d0020", nbdFbg:"#1e0a3c", nbdBd:"#f97316", nbdTx:"#f97316" },
    { sCo:"#6d28d9", sDiv:"#ede9fe", sFbg:"#fefce8", sFbd:"#fde68a", sFtx:"#a16207",
      dWbg:"#0d0020", dHbg:"#1e0a3c", dAcc:"#eab308", dCo:"#eab308", dFtx:"#eab308",
      bHg1:"#1e0a3c", bHg2:"#3b0764", bFbg:"#fefce8", bFbd:"#fde68a", bFtx:"#92400e",
      nWbg:"#0d0020", nHbg:"#1e0a3c", nAcc:"#eab308", nFtx:"#eab308",
      nbHbg:"#1e0a3c", nbCo:"#eab308", nbdBg:"#0d0020", nbdFbg:"#1e0a3c", nbdBd:"#eab308", nbdTx:"#eab308" },
    { sCo:"#7c3aed", sDiv:"#ddd6fe", sFbg:"#eff6ff", sFbd:"#bfdbfe", sFtx:"#1d4ed8",
      dWbg:"#06061e", dHbg:"#0f0a30", dAcc:"#3b82f6", dCo:"#a78bfa", dFtx:"#93c5fd",
      bHg1:"#4c1d95", bHg2:"#1d4ed8", bFbg:"#f5f3ff", bFbd:"#ddd6fe", bFtx:"#1d4ed8",
      nWbg:"#06061e", nHbg:"#0f0a30", nAcc:"#7c3aed", nFtx:"#a78bfa",
      nbHbg:"#4c1d95", nbCo:"#93c5fd", nbdBg:"#06061e", nbdFbg:"#0f0a30", nbdBd:"#7c3aed", nbdTx:"#a78bfa" },
    { sCo:"#1e40af", sDiv:"#bfdbfe", sFbg:"#f0f4ff", sFbd:"#ef4444", sFtx:"#dc2626",
      dWbg:"#060c1f", dHbg:"#0d1a40", dAcc:"#ef4444", dCo:"#fff", dFtx:"#fca5a5",
      bHg1:"#1e3a8a", bHg2:"#1d4ed8", bFbg:"#fff1f2", bFbd:"#fecdd3", bFtx:"#dc2626",
      nWbg:"#060c1f", nHbg:"#0d1a40", nAcc:"#ef4444", nFtx:"#fca5a5",
      nbHbg:"#1d4ed8", nbCo:"#fff", nbdBg:"#060c1f", nbdFbg:"#0d1a40", nbdBd:"#ef4444", nbdTx:"#fca5a5" },
    { sCo:"#b91c1c", sDiv:"#fecdd3", sFbg:"#fff1f2", sFbd:"#fecdd3", sFtx:"#991b1b",
      dWbg:"#0a0a0a", dHbg:"#1a0505", dAcc:"#dc2626", dCo:"#f87171", dFtx:"#f87171",
      bHg1:"#111111", bHg2:"#1f0606", bFbg:"#fff1f2", bFbd:"#fecdd3", bFtx:"#b91c1c",
      nWbg:"#0a0a0a", nHbg:"#111111", nAcc:"#dc2626", nFtx:"#f87171",
      nbHbg:"#111111", nbCo:"#ef4444", nbdBg:"#0a0a0a", nbdFbg:"#1a0505", nbdBd:"#dc2626", nbdTx:"#f87171" },
    { sCo:"#111111", sDiv:"#d1d5db", sFbg:"#f3f4f6", sFbd:"#d1d5db", sFtx:"#374151",
      dWbg:"#0a0a0a", dHbg:"#1a1a1a", dAcc:"#e5e7eb", dCo:"#fff", dFtx:"#f3f4f6",
      bHg1:"#111111", bHg2:"#374151", bFbg:"#f9fafb", bFbd:"#e5e7eb", bFtx:"#111111",
      nWbg:"#0a0a0a", nHbg:"#111111", nAcc:"#e5e7eb", nFtx:"#f3f4f6",
      nbHbg:"#111111", nbCo:"#fff", nbdBg:"#0a0a0a", nbdFbg:"#1a1a1a", nbdBd:"#e5e7eb", nbdTx:"#f3f4f6" },
    { sCo:"#6d28d9", sDiv:"#ddd6fe", sFbg:"#f0fdf4", sFbd:"#bbf7d0", sFtx:"#166534",
      dWbg:"#060a0e", dHbg:"#100a28", dAcc:"#22c55e", dCo:"#a78bfa", dFtx:"#86efac",
      bHg1:"#4c1d95", bHg2:"#6d28d9", bFbg:"#f0fdf4", bFbd:"#bbf7d0", bFtx:"#166534",
      nWbg:"#060a0e", nHbg:"#100a28", nAcc:"#16a34a", nFtx:"#4ade80",
      nbHbg:"#4c1d95", nbCo:"#4ade80", nbdBg:"#060a0e", nbdFbg:"#100a28", nbdBd:"#22c55e", nbdTx:"#86efac" },
  ];

  const p = P[pi];
  const logo = info?.company_logo
    ? `<img src="${e(info.company_logo)}" style="max-height:80px;max-width:220px;object-fit:contain;" alt=""/>`
    : "";
  const bigLogo = info?.company_logo
    ? `<img src="${e(info.company_logo)}" style="max-height:140px;max-width:90%;width:auto;object-fit:contain;" alt=""/>`
    : "";
  const co = e(info?.company_name || "");
  const bodyHtml = bodyText.split(/\n\n+/).map((par: string) =>
    "<p style='margin:0 0 16px;'>" + par.split(/\n/).map((l: string) => e(l)).join("<br/>") + "</p>"
  ).join("");

  if (li === 0) {  // Clean & Simple
    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:26px 32px 8px;text-align:center;">
${logo ? `<div style="margin-bottom:10px;">${logo}</div>` : ""}
${co ? `<div style="font-size:20px;font-weight:700;color:${p.sCo};">${co}</div>` : ""}
</td></tr>
<tr><td><div style="height:2px;background:${p.sDiv};margin:0 32px;"></div></td></tr>
<tr><td style="padding:24px 32px 28px;font-size:15px;color:#333;line-height:1.7;">${bodyHtml}</td></tr>
<tr><td style="background:${p.sFbg};border-top:1px solid ${p.sFbd};padding:18px 32px;text-align:center;font-size:13px;font-weight:700;color:${p.sFtx};">Thank you for your business!</td></tr>
</table></td></tr></table></body></html>`;
  }

  if (li === 1) {  // Dark Professional
    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:${p.dWbg};border-radius:8px;overflow:hidden;">
<tr><td style="background:${p.dHbg};padding:26px 32px;text-align:center;border-bottom:2px solid ${p.dAcc};">
${logo ? `<div style="margin-bottom:10px;">${logo}</div>` : ""}
${co ? `<div style="font-size:22px;font-weight:700;color:${p.dCo};">${co}</div>` : ""}
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;color:#ddd;line-height:1.7;">${bodyHtml}</td></tr>
<tr><td style="background:${p.dHbg};border-top:2px solid ${p.dAcc};padding:18px 32px;text-align:center;font-size:13px;font-weight:700;color:${p.dFtx};">Thank you for your business!</td></tr>
</table></td></tr></table></body></html>`;
  }

  if (li === 2) {  // Brand Header
    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,${p.bHg1},${p.bHg2});padding:28px 32px;text-align:center;">
${logo ? `<div style="margin-bottom:10px;">${logo}</div>` : ""}
${co ? `<div style="font-size:22px;font-weight:800;color:#fff;">${co}</div>` : ""}
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;color:#333;line-height:1.7;">${bodyHtml}</td></tr>
<tr><td style="background:${p.bFbg};border-top:1px solid ${p.bFbd};padding:18px 32px;text-align:center;font-size:13px;font-weight:700;color:${p.bFtx};">Thank you for your business!</td></tr>
</table></td></tr></table></body></html>`;
  }

  if (li === 4) {  // Name Banner (company name full-width, no logo)
    return `<!DOCTYPE html><html><body style="margin:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:${p.nbHbg};padding:36px 40px;text-align:center;">
${co ? `<div style="font-size:30px;font-weight:800;color:${p.nbCo};letter-spacing:.01em;">${co}</div>` : ""}
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;color:#333;line-height:1.7;">${bodyHtml}</td></tr>
<tr><td style="background:${p.sFbg};border-top:1px solid ${p.sFbd};padding:18px 32px;text-align:center;font-size:13px;font-weight:700;color:${p.sFtx};">Thank you for your business!</td></tr>
</table></td></tr></table></body></html>`;
  }

  if (li === 5) {  // Name Banner (Dark) — same header, dark body/footer
    const nbdHbg = p.nbdHbg || p.nbHbg;
    const nbdCo  = p.nbdCo  || p.nbCo;
    return `<!DOCTYPE html><html><body style="margin:0;background:${p.nbdBg};font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:${p.nbdBg};border-radius:8px;overflow:hidden;">
<tr><td style="background:${nbdHbg};padding:36px 40px;text-align:center;">
${co ? `<div style="font-size:30px;font-weight:800;color:${nbdCo};letter-spacing:.01em;">${co}</div>` : ""}
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;color:#ddd;line-height:1.7;">${bodyHtml}</td></tr>
<tr><td style="background:${p.nbdFbg};border-top:2px solid ${p.nbdBd};padding:18px 32px;text-align:center;font-size:13px;font-weight:700;color:${p.nbdTx};">Thank you for your business!</td></tr>
</table></td></tr></table></body></html>`;
  }

  // li === 3: Dark Logo Banner
  return `<!DOCTYPE html><html><body style="margin:0;background:#0e0e0e;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="padding:30px 0"><tr><td align="center">
<table width="600" style="background:${p.nWbg};border-radius:8px;overflow:hidden;border:1px solid #333;">
<tr><td style="background:${p.nHbg};padding:28px 20px;text-align:center;border-bottom:2px solid ${p.nAcc};">
${bigLogo}
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;color:#ddd;line-height:1.7;">${bodyHtml}</td></tr>
<tr><td style="background:${p.nHbg};border-top:2px solid ${p.nAcc};padding:18px 32px;text-align:center;font-size:13px;font-weight:700;color:${p.nFtx};">Thank you for your business!</td></tr>
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
      const from    = (emailInfo?.company_name || companyName || "SprayBossPro") + " <Kurtis@spraybosspro.com>";
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
