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
    const { action, email, password, user_id, company_name, trial_ends_at } = await req.json();

    /* ── Create user ── */
    if (action === "create") {
      if (!email || !password) return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: CORS });
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

      // Also record in platform_accounts so admin sign-up panel works
      await supabase.from("platform_accounts").insert({
        user_id:       data.user.id,
        email:         data.user.email,
        company_name:  company_name || null,
        trial_ends_at: trial_ends_at || null,
        active:        false,
        onboarded:     false,
      }).catch(() => {});

      return new Response(JSON.stringify({ ok: true, user: { id: data.user.id, email: data.user.email } }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    /* ── Update password ── */
    if (action === "update_password") {
      if (!user_id || !password) return new Response(JSON.stringify({ error: "user_id and password required" }), { status: 400, headers: CORS });
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    /* ── Delete user ── */
    if (action === "delete") {
      if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: CORS });
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    /* ── List users ── */
    if (action === "list") {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      const users = (data.users || []).map(function(u: any) {
        return { id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, confirmed: !!u.email_confirmed_at };
      });
      return new Response(JSON.stringify({ users }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
