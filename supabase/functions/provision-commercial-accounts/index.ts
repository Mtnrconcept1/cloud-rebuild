import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CommercialAccountInput = {
  full_name: string;
  email: string;
  password: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";

  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing server configuration" }, 500);
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: "Unauthorized" }, 401);

  const { data: callerRoles, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerData.user.id);

  if (roleError) return json({ error: roleError.message }, 500);
  if (!(callerRoles || []).some((row) => String(row.role) === "admin")) {
    return json({ error: "Admin role required" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const accounts = Array.isArray(body?.accounts) ? body.accounts as CommercialAccountInput[] : [];
  if (accounts.length !== 4) return json({ error: "Exactly four commercial accounts are required" }, 400);

  const normalized = accounts.map((account) => ({
    full_name: String(account.full_name || "").trim(),
    email: String(account.email || "").trim().toLowerCase(),
    password: String(account.password || ""),
  }));

  for (const account of normalized) {
    if (!account.full_name || !account.email || account.password.length < 8) {
      return json({ error: `Invalid account payload for ${account.full_name || account.email || "unknown"}` }, 400);
    }
  }

  const demoUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (demoUsers.error) return json({ error: demoUsers.error.message }, 500);

  const legacyDemoUsers = demoUsers.data.users.filter((user) =>
    /^commercial(0[1-9]|10)@demo\.thetok\.ch$/i.test(user.email || "")
  );

  for (const user of legacyDemoUsers) {
    const { error } = await admin.auth.admin.deleteUser(user.id, true);
    if (error) return json({ error: `Unable to remove ${user.email}: ${error.message}` }, 500);
  }

  const created = [];
  for (const account of normalized) {
    const existing = demoUsers.data.users.find((user) => user.email?.toLowerCase() === account.email);
    let userId = existing?.id || "";

    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password: account.password,
        email_confirm: true,
        user_metadata: { ...existing.user_metadata, full_name: account.full_name, role: "commercial" },
      });
      if (error) return json({ error: `Unable to update ${account.email}: ${error.message}` }, 500);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.full_name, role: "commercial" },
      });
      if (error || !data.user) return json({ error: `Unable to create ${account.email}: ${error?.message || "unknown error"}` }, 500);
      userId = data.user.id;
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ user_id: userId, full_name: account.full_name }, { onConflict: "user_id" });
    if (profileError) return json({ error: profileError.message }, 500);

    const { error: roleUpsertError } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "commercial" }, { onConflict: "user_id,role" });
    if (roleUpsertError) return json({ error: roleUpsertError.message }, 500);

    created.push({ user_id: userId, email: account.email, full_name: account.full_name });
  }

  return json({ ok: true, removed_demo_accounts: legacyDemoUsers.length, accounts: created });
});
