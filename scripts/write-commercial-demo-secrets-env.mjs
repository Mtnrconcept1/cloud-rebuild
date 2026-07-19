import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEMO_PROJECT_REF = "hzldfhjfgjcadmpghhhf";
const DEMO_PROJECT_URL = `https://${DEMO_PROJECT_REF}.supabase.co`;
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf("=");
  return index > 2 && arg.startsWith("--")
    ? [arg.slice(2, index), arg.slice(index + 1)]
    : [arg.replace(/^--/, ""), ""];
}));

const keyFile = requireAbsolute(args["keys-file"], "keys-file");
const productionOut = requireAbsolute(args["production-out"], "production-out");
const demoOut = requireAbsolute(args["demo-out"], "demo-out");
const keys = JSON.parse(fs.readFileSync(keyFile, "utf8"));
if (!Array.isArray(keys)) throw new Error("Supabase API key response must be an array");

const secretEntry = keys.find((entry) =>
  entry && typeof entry === "object"
  && entry.type === "secret"
  && entry.disabled !== true
) || keys.find((entry) =>
  entry && typeof entry === "object"
  && (entry.name === "service_role" || entry.type === "service_role")
  && entry.disabled !== true
);
const demoSecret = clean(secretEntry?.api_key || secretEntry?.value || secretEntry?.key);
if (!demoSecret) throw new Error("No active secret key was returned for the demo project");

writePrivateEnv(productionOut, [
  ["DEMO_SUPABASE_URL", DEMO_PROJECT_URL],
  ["DEMO_SUPABASE_PROJECT_REF", DEMO_PROJECT_REF],
  ["DEMO_SUPABASE_SECRET_KEY", demoSecret],
]);

const stripeTest = requireSecret("STRIPE_SECRET_KEY_TEST");
if (!stripeTest.startsWith("sk_test_")) {
  throw new Error("STRIPE_SECRET_KEY_TEST must be a Stripe test secret key");
}
const tokOneTest = clean(process.env.STRIPE_TOK_ONE_TEST_SECRET_KEY);
if (tokOneTest && !tokOneTest.startsWith("sk_test_")) {
  throw new Error("STRIPE_TOK_ONE_TEST_SECRET_KEY must be a Stripe test secret key");
}

const demoEntries = [
  ["OPENAI_API_KEY", requireSecret("OPENAI_API_KEY")],
  ["OPENAI_MODEL", clean(process.env.OPENAI_MODEL)],
  ["OPENAI_IMAGE_TIMEOUT_MS", clean(process.env.OPENAI_IMAGE_TIMEOUT_MS)],
  ["TOK_IMAGE_FAST_INTERACTIVE", clean(process.env.TOK_IMAGE_FAST_INTERACTIVE)],
  ["TOK_INTERACTIVE_IMAGE_TIMEOUT_MS", clean(process.env.TOK_INTERACTIVE_IMAGE_TIMEOUT_MS)],
  ["TOK_AI_IMAGE_BUCKET", clean(process.env.TOK_AI_IMAGE_BUCKET)],
  ["TOK_GALLERY_IMAGE_BUCKET", clean(process.env.TOK_GALLERY_IMAGE_BUCKET)],
  ["TOK_SOURCE_IMAGE_TIMEOUT_MS", clean(process.env.TOK_SOURCE_IMAGE_TIMEOUT_MS)],
  ["FIRECRAWL_API_KEY", clean(process.env.FIRECRAWL_API_KEY)],
  ["STRIPE_SECRET_KEY", stripeTest],
  ["STRIPE_SECRET_KEY_TEST", stripeTest],
  ["STRIPE_TOK_ONE_SECRET_KEY", tokOneTest],
  ["STRIPE_TOK_ONE_TEST_SECRET_KEY", tokOneTest],
  ["STRIPE_WEBHOOK_SECRET", clean(process.env.STRIPE_TEST_WEBHOOK_SECRET)],
  ["STRIPE_WEBHOOK_SIGNING_SECRET", clean(process.env.STRIPE_TEST_WEBHOOK_SECRET)],
  ["STRIPE_TOK_ONE_WEBHOOK_SECRET", clean(process.env.STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET)],
  ["STRIPE_TOK_ONE_WEBHOOK_SIGNING_SECRET", clean(process.env.STRIPE_TOK_ONE_TEST_WEBHOOK_SIGNING_SECRET)],
  ["ALLOWED_ORIGINS", "https://commercial.thetok.ch"],
  ["APP_BASE_URL", "https://commercial.thetok.ch"],
  ["PUBLIC_APP_URL", "https://commercial.thetok.ch"],
  ["SITE_URL", "https://commercial.thetok.ch"],
  ["ENVIRONMENT", "commercial_demo"],
  ["APP_ENV", "commercial_demo"],
].filter(([, value]) => value);

writePrivateEnv(demoOut, demoEntries);
console.log("Prepared dedicated commercial demo secret files (values hidden).");

function requireAbsolute(value, name) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`--${name} must be an absolute path`);
  }
  return value;
}

function clean(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function requireSecret(name) {
  const value = clean(process.env[name]);
  if (!value) throw new Error(`${name} is required for the dedicated demo project`);
  return value;
}

function quote(value) {
  return /^[A-Za-z0-9_./:@,+\-]+$/.test(value) ? value : JSON.stringify(value);
}

function writePrivateEnv(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    file,
    `${entries.map(([name, value]) => `${name}=${quote(value)}`).join("\n")}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  fs.chmodSync(file, 0o600);
}
