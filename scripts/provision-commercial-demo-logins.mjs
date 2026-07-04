#!/usr/bin/env node
import "dotenv/config";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!rawUrl || !serviceRoleKey) {
  console.error([
    "Missing Supabase provisioning environment.",
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run:",
    "  pnpm commercial:demo-logins",
    "Use --dry-run to only list the demo credentials.",
  ].join("\n"));
  process.exit(1);
}

const endpoint = `${rawUrl.replace(/\/+$/, "")}/functions/v1/provision-commercial-demo-logins`;

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ dry_run: dryRun }),
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

if (!response.ok || payload?.ok === false) {
  console.error("Commercial demo login provisioning failed.");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(dryRun ? "Commercial demo login dry-run:" : "Commercial demo logins provisioned:");
console.table((payload.credentials || []).map((entry) => ({
  username: entry.username,
  email: entry.email,
  code: entry.code,
  restaurant: entry.restaurant_name,
})));
