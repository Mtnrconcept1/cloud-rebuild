import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const outFile = readOutFile(process.argv.slice(2));
const allowedNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SIGNING_SECRET",
  "INTERNAL_CRON_SECRET",
  "CRON_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "APP_BASE_URL",
  "PUBLIC_APP_URL",
  "SITE_URL",
  "ALLOWED_ORIGINS",
  "FIREBASE_SERVICE_ACCOUNT",
  "LOVABLE_API_KEY",
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

ensureDefault(entries, "ENVIRONMENT", "production");
ensureDefault(entries, "APP_ENV", "production");

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  `${entries.map(([name, value]) => `${name}=${quoteEnvValue(value)}`).join("\n")}\n`,
  "utf8",
);

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

function quoteEnvValue(value) {
  if (/^[A-Za-z0-9_./:@,+\-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}
