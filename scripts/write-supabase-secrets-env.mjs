import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const outFile = readOutFile(process.argv.slice(2));
const allowedNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_PERSONNAL_SECRET_KEY",
  "STRIPE_PERSONAL_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_SECRET_KEY_LIVE",
  "STRIPE_SECRET_KEY_TEST",
  "STRIPE_LIVE_WEBHOOK",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET_LIVE",
  "STRIPE_WEBHOOK_SIGNING_SECRET",
  "STRIPE_WEBHOOK_SIGNING_SECRET_LIVE",
  "STRIPE_TOK_ONE_SECRET_KEY",
  "STRIPE_TOK_ONE_TEST_SECRET_KEY",
  "STRIPE_TOK_ONE_WEBHOOK_SECRET",
  "STRIPE_TOK_ONE_WEBHOOK_SIGNING_SECRET",
  "STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET",
  "STRIPE_TOK_ONE_TEST_WEBHOOK_SIGNING_SECRET",
  "INTERNAL_CRON_SECRET",
  "CRON_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_IMAGE_TIMEOUT_MS",
  "TOK_IMAGE_FAST_INTERACTIVE",
  "TOK_INTERACTIVE_IMAGE_TIMEOUT_MS",
  "TOK_AI_IMAGE_BUCKET",
  "TOK_GALLERY_IMAGE_BUCKET",
  "TOK_SOURCE_IMAGE_TIMEOUT_MS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "OPS_CONTROL_SECRET",
  "OPS_INGEST_SECRET",
  "OPS_GITHUB_CALLBACK_SECRET",
  "GITHUB_INCIDENT_TOKEN",
  "GITHUB_INCIDENT_REPOSITORY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ADMIN_CHAT_ID",
  "TELEGRAM_ADMIN_USER_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "APP_BASE_URL",
  "PUBLIC_APP_URL",
  "SITE_URL",
  "ALLOWED_ORIGINS",
  "FIREBASE_SERVICE_ACCOUNT",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_TOKEN_URI",
  "FIRECRAWL_API_KEY",
  "ENVIRONMENT",
  "APP_ENV",
];

const entries = [];

for (const name of allowedNames) {
  const value = cleanValue(process.env[name]);
  if (value === null) {
    continue;
  }

  entries.push([name, value]);
}

const derivedAllowedOrigins = deriveAllowedOrigins(entries);
if (derivedAllowedOrigins && !entries.some(([name]) => name === "ALLOWED_ORIGINS")) {
  entries.push(["ALLOWED_ORIGINS", derivedAllowedOrigins]);
}

const stripePersonalSecretKey = cleanValue(process.env.STRIPE_PERSONNAL_SECRET_KEY);
const stripePersonalSecretKeyAlt = cleanValue(process.env.STRIPE_PERSONAL_SECRET_KEY);
const stripeSecretKey = cleanValue(process.env.STRIPE_SECRET_KEY);
const stripeSecretKeyLive = cleanValue(process.env.STRIPE_SECRET_KEY_LIVE);
const platformStripeSecretKey = [
  stripePersonalSecretKey,
  stripePersonalSecretKeyAlt,
  stripeSecretKeyLive,
  stripeSecretKey?.startsWith("sk_") ? stripeSecretKey : null,
].find((value) => value?.startsWith("sk_"));

removePublicStripeKeyAliases(entries);
if (platformStripeSecretKey) {
  ensureDefault(entries, "STRIPE_SECRET_KEY_LIVE", platformStripeSecretKey);
  ensureDefault(entries, "STRIPE_SECRET_KEY", platformStripeSecretKey);
}

const liveWebhookSecret = cleanValue(process.env.STRIPE_LIVE_WEBHOOK);
if (liveWebhookSecret) {
  ensureDefault(entries, "STRIPE_WEBHOOK_SECRET", liveWebhookSecret);
  ensureDefault(entries, "STRIPE_WEBHOOK_SECRET_LIVE", liveWebhookSecret);
  ensureDefault(entries, "STRIPE_WEBHOOK_SIGNING_SECRET", liveWebhookSecret);
  ensureDefault(entries, "STRIPE_WEBHOOK_SIGNING_SECRET_LIVE", liveWebhookSecret);
}

ensureDefault(entries, "ENVIRONMENT", "production");
ensureDefault(entries, "APP_ENV", "production");

fs.mkdirSync(path.dirname(outFile), { recursive: true, mode: 0o700 });
fs.writeFileSync(
  outFile,
  `${entries.map(([name, value]) => `${name}=${quoteEnvValue(value)}`).join("\n")}\n`,
  { encoding: "utf8", mode: 0o600 },
);
// writeFile preserves an existing file mode, so enforce private permissions
// after every rewrite as well as on first creation.
fs.chmodSync(outFile, 0o600);

console.log(`Wrote Supabase secrets env file to ${outFile}`);
console.log(`Secret keys prepared: ${entries.map(([name]) => name).join(", ")}`);

function readOutFile(args) {
  const outArg = args.find((arg) => arg.startsWith("--out="));
  const relativePath = outArg ? outArg.slice("--out=".length) : path.join(".tmp", "supabase.functions.env");
  return path.isAbsolute(relativePath) ? relativePath : path.join(ROOT, relativePath);
}

function cleanValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ensureDefault(entries, name, value) {
  if (entries.some(([entryName]) => entryName === name)) {
    return;
  }

  entries.push([name, value]);
}

function removePublicStripeKeyAliases(entries) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const [name, value] = entries[index];
    if ((name === "STRIPE_SECRET_KEY" || name === "STRIPE_SECRET_KEY_LIVE") && value.startsWith("pk_")) {
      entries.splice(index, 1);
    }
  }
}

function deriveAllowedOrigins(entries) {
  const originCandidates = ["APP_BASE_URL", "PUBLIC_APP_URL", "SITE_URL"]
    .map((name) => entries.find(([entryName]) => entryName === name)?.[1] || null)
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);

  if (originCandidates.length === 0) {
    return null;
  }

  return Array.from(new Set(originCandidates)).join(",");
}

function normalizeOrigin(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function quoteEnvValue(value) {
  if (/^[A-Za-z0-9_./:@,+\-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}
