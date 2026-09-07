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
const providerSource = args["provider-source"]
  ? requireAbsolute(args["provider-source"], "provider-source")
  : path.join(requireEnvironmentPath("RUNNER_TEMP"), "supabase.functions.env");
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

const stripeTest = clean(process.env.STRIPE_SECRET_KEY_TEST)
  || readPrivateEnvValue(providerSource, "STRIPE_SECRET_KEY_TEST");
if (!stripeTest?.startsWith("sk_test_")) {
  throw new Error("STRIPE_SECRET_KEY_TEST must be configured with a Stripe test secret key");
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
  ["STRIPE_SECRET_KEY_TEST", stripeTest],
  ["ALLOWED_ORIGINS", "https://commercial.thetok.ch"],
  ["APP_BASE_URL", "https://commercial.thetok.ch"],
  ["PUBLIC_APP_URL", "https://commercial.thetok.ch"],
  ["SITE_URL", "https://commercial.thetok.ch"],
  ["ENVIRONMENT", "commercial_demo"],
  ["APP_ENV", "commercial_demo"],
  ["DEMO_PAYMENT_MODE", "stripe_test"],
].filter(([, value]) => value);

writePrivateEnv(demoOut, demoEntries);
console.log("Prepared dedicated commercial demo secret files with Stripe Test only (values hidden).");

function requireAbsolute(value, name) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`--${name} must be an absolute path`);
  }
  return value;
}

function requireEnvironmentPath(name) {
  const value = clean(process.env[name]);
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
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

function readPrivateEnvValue(file, name) {
  if (!fs.existsSync(file)) {
    throw new Error(`Provider source env is missing: ${file}`);
  }
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1 || line.slice(0, separator) !== name) continue;
    const rawValue = line.slice(separator + 1).trim();
    if (!rawValue) return null;
    if (rawValue.startsWith('"')) {
      try {
        return clean(JSON.parse(rawValue));
      } catch {
        throw new Error(`${name} is malformed in provider source env`);
      }
    }
    return clean(rawValue);
  }
  return null;
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
