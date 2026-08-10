import crypto from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const OUTPUT_FILE = requireEnv("APP_REVIEW_CREDENTIAL_FILE");
const REVIEW_EMAIL = "appreview@thetok.ch";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function serviceHeaders(extra = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function jsonRequest(url, init = {}, { allow404 = false } = {}) {
  const response = await fetch(url, init);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Keep failure messages deterministic and never print arbitrary bodies.
  }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return payload;
}

async function findReviewUser() {
  for (let page = 1; page <= 10; page += 1) {
    const payload = await jsonRequest(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=100`, {
      headers: serviceHeaders(),
    });
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const found = users.find((user) => String(user?.email || "").toLowerCase() === REVIEW_EMAIL);
    if (found) return found;
    if (users.length < 100) break;
  }
  return null;
}

async function createOrResetUser(password) {
  let user = await findReviewUser();
  const metadata = {
    full_name: "Apple Review",
    app_review_account: true,
    legal_terms_accepted: true,
    privacy_policy_accepted: true,
  };

  if (!user) {
    user = await jsonRequest(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        email: REVIEW_EMAIL,
        password,
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: { app_review_account: true },
      }),
    });
  } else {
    user = await jsonRequest(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: serviceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: { ...(user.app_metadata || {}), app_review_account: true },
      }),
    });
  }

  if (!user?.id || !/^[0-9a-f-]{36}$/i.test(user.id)) {
    throw new Error("Supabase did not return a valid App Review user id.");
  }
  return user;
}

async function ensureProfile(userId) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?on_conflict=user_id`;
  const response = await fetch(url, {
    method: "POST",
    headers: serviceHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      user_id: userId,
      full_name: "Apple Review",
      phone: "+41 76 475 66 69",
      city: "Genève",
    }),
  });
  if (!response.ok) throw new Error(`Unable to prepare App Review profile (HTTP ${response.status}).`);
}

async function ensureClientRole(userId) {
  const encodedUserId = encodeURIComponent(`eq.${userId}`);
  const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=${encodedUserId}&role=neq.client`, {
    method: "DELETE",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
  });
  if (!deleteResponse.ok) throw new Error(`Unable to isolate App Review role (HTTP ${deleteResponse.status}).`);

  const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?on_conflict=user_id,role`, {
    method: "POST",
    headers: serviceHeaders({
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    }),
    body: JSON.stringify({ user_id: userId, role: "client" }),
  });
  if (!insertResponse.ok) throw new Error(`Unable to assign App Review client role (HTTP ${insertResponse.status}).`);
}

async function verifyPasswordLogin(password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: REVIEW_EMAIL, password }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* no-op */ }
  if (!response.ok || !payload?.access_token || payload?.user?.email?.toLowerCase() !== REVIEW_EMAIL) {
    throw new Error("App Review account authentication verification failed.");
  }
}

async function main() {
  const password = `TokReview-${crypto.randomBytes(24).toString("base64url")}!A7`;
  console.log(`::add-mask::${password}`);

  const user = await createOrResetUser(password);
  await ensureProfile(user.id);
  await ensureClientRole(user.id);
  await verifyPasswordLogin(password);

  await writeFile(OUTPUT_FILE, `${JSON.stringify({ email: REVIEW_EMAIL, password })}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(OUTPUT_FILE, 0o600);

  console.log(`App Review account is ready and password authentication succeeded for ${REVIEW_EMAIL}.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`App Review account preparation failed: ${message}`);
  process.exit(1);
});
