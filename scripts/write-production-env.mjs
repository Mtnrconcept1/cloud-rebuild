import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseDotenv } from "dotenv";

const ROOT = process.cwd();
const outFile = readOutFile(process.argv.slice(2));
const baseEnv = readDotenvFile(path.join(ROOT, ".env.production"));

const values = {
  VITE_SUPABASE_PROJECT_ID: resolveRequired("VITE_SUPABASE_PROJECT_ID", {
    fallback: baseEnv.VITE_SUPABASE_PROJECT_ID,
  }),
  VITE_SUPABASE_URL: resolveRequired("VITE_SUPABASE_URL", {
    fallback: baseEnv.VITE_SUPABASE_URL,
  }),
  VITE_SUPABASE_PUBLISHABLE_KEY: resolveRequired("VITE_SUPABASE_PUBLISHABLE_KEY", {
    fallback: baseEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  }),
  VITE_STRIPE_PUBLISHABLE_KEY: resolveRequired("VITE_STRIPE_PUBLISHABLE_KEY", {
    fallback: process.env.VITE_STRIPE_PUBLISHABLE_KEY_FALLBACK ?? baseEnv.VITE_STRIPE_PUBLISHABLE_KEY,
    validate: (value) => value.startsWith("pk_live_"),
    validationMessage: "must be a live Stripe publishable key (pk_live_...).",
  }),
  VITE_FIREBASE_API_KEY: resolveRequired("VITE_FIREBASE_API_KEY"),
  VITE_FIREBASE_AUTH_DOMAIN: resolveRequired("VITE_FIREBASE_AUTH_DOMAIN", {
    fallback: baseEnv.VITE_FIREBASE_AUTH_DOMAIN,
  }),
  VITE_FIREBASE_PROJECT_ID: resolveRequired("VITE_FIREBASE_PROJECT_ID", {
    fallback: baseEnv.VITE_FIREBASE_PROJECT_ID,
  }),
  VITE_FIREBASE_MESSAGING_SENDER_ID: resolveRequired("VITE_FIREBASE_MESSAGING_SENDER_ID", {
    fallback: baseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  }),
  VITE_FIREBASE_APP_ID: resolveRequired("VITE_FIREBASE_APP_ID"),
  VITE_FIREBASE_VAPID_KEY: resolveRequired("VITE_FIREBASE_VAPID_KEY"),
  VITE_SENTRY_DSN: resolveOptional("VITE_SENTRY_DSN"),
  VITE_SENTRY_ENVIRONMENT: resolveOptional("VITE_SENTRY_ENVIRONMENT", {
    fallback: "production",
  }),
  VITE_APP_RELEASE: resolveOptional("VITE_APP_RELEASE", {
    fallback: defaultRelease(),
  }),
};

const lines = Object.entries(values)
  .filter(([, value]) => value !== null)
  .map(([key, value]) => `${key}=${quote(value)}`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${lines.join("\n")}\n`, "utf8");

console.log(`Wrote production frontend env to ${outFile}`);
console.log(`Keys: ${Object.keys(values).filter((key) => values[key] !== null).join(", ")}`);

function readOutFile(args) {
  const outArg = args.find((arg) => arg.startsWith("--out="));
  const relativePath = outArg ? outArg.slice("--out=".length) : ".env.production.local";
  return path.isAbsolute(relativePath) ? relativePath : path.join(ROOT, relativePath);
}

function readDotenvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return parseDotenv(fs.readFileSync(filePath));
}

function resolveRequired(name, options = {}) {
  const value = resolveOptional(name, options);
  if (value === null) {
    throw new Error(`Missing required production build variable ${name}.`);
  }

  if (typeof options.validate === "function" && !options.validate(value)) {
    throw new Error(`Invalid value for ${name}: ${options.validationMessage ?? "validation failed."}`);
  }

  return value;
}

function resolveOptional(name, options = {}) {
  const candidates = [
    process.env[name],
    options.fallback,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanValue(candidate);
    if (cleaned !== null) {
      return cleaned;
    }
  }

  return null;
}

function cleanValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (
    trimmed.includes("REPLACE_WITH")
    || lower.includes("your-project")
    || lower.includes("examplepublickey")
    || lower.includes("replace-me")
  ) {
    return null;
  }

  return trimmed;
}

function defaultRelease() {
  const sha = cleanValue(process.env.GITHUB_SHA);
  if (sha) {
    return `tok-web@${sha.slice(0, 12)}`;
  }

  return "tok-web@local";
}

function quote(value) {
  return JSON.stringify(value);
}
