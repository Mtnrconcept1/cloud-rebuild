import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";

const DEFAULT_ENV_FILES = [".env.production", ".env.production.local"];
const REQUIRED_EDGE_SECRETS = [
  ["STRIPE_SECRET_KEY", /^sk_live_/, "Missing STRIPE_SECRET_KEY live secret for production payments."],
  ["STRIPE_WEBHOOK_SECRET", /^whsec_/, "Missing STRIPE_WEBHOOK_SECRET for production payment capture."],
  ["FIREBASE_SERVICE_ACCOUNT", /service_account/, "Missing FIREBASE_SERVICE_ACCOUNT for production push delivery."],
  ["INTERNAL_CRON_SECRET", /^.{16,}$/, "Missing INTERNAL_CRON_SECRET with at least 16 characters."],
  ["RESEND_API_KEY", /^re_/, "Missing RESEND_API_KEY for production email delivery."],
  ["EMAIL_FROM", /@/, "Missing EMAIL_FROM for production transactional email."],
  ["APP_BASE_URL", /^https:\/\//, "Missing APP_BASE_URL production HTTPS URL."],
  ["PUBLIC_APP_URL", /^https:\/\//, "Missing PUBLIC_APP_URL production HTTPS URL."],
  ["ALLOWED_ORIGINS", /^https:\/\//, "Missing ALLOWED_ORIGINS production HTTPS allowlist."],
];

export function inspectReleaseReadiness(options = {}) {
  const root = options.root || process.cwd();
  const env = {
    ...readEnvStack(root, options.envFiles || DEFAULT_ENV_FILES),
    ...(options.env || process.env),
  };

  const errors = [];
  const warnings = [];

  inspectStripe(env, errors);
  inspectMobileAssociations(root, env, errors, warnings);
  inspectAndroidSigning(root, env, errors);
  inspectEdgeSecrets(env, errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function readEnvStack(root, files) {
  const env = {};

  for (const file of files) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    Object.assign(env, parseDotenv(fs.readFileSync(absolute)));
  }

  return env;
}

function clean(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isPlaceholder(value) {
  const normalized = clean(value).toLowerCase();
  return (
    !normalized
    || normalized.includes("replace")
    || normalized.includes("your-project")
    || normalized.includes("example")
    || normalized.includes("<apple_team_id>")
    || normalized.includes("xx:xx")
  );
}

function inspectStripe(env, errors) {
  const publishable = clean(env.VITE_STRIPE_PUBLISHABLE_KEY);
  if (!/^pk_live_/.test(publishable)) {
    errors.push("Missing VITE_STRIPE_PUBLISHABLE_KEY live publishable key for production checkout.");
  }
}

function inspectMobileAssociations(root, env, errors, warnings) {
  const aasaPath = path.join(root, "public", ".well-known", "apple-app-site-association");
  const assetlinksPath = path.join(root, "public", ".well-known", "assetlinks.json");

  if (!fs.existsSync(aasaPath)) {
    errors.push("Missing public/.well-known/apple-app-site-association for iOS Universal Links.");
  } else {
    const parsed = readJsonFile(aasaPath, errors, "Invalid apple-app-site-association JSON.");
    const appIds = parsed?.applinks?.details
      ?.flatMap((detail) => Array.isArray(detail.appIDs) ? detail.appIDs : [])
      ?.map(clean) || [];
    const appleTeamId = clean(env.APPLE_TEAM_ID || env.IOS_APPLE_TEAM_ID);

    if (appIds.length === 0 || appIds.some(isPlaceholder)) {
      errors.push("apple-app-site-association must include a real Apple Team ID appID for com.tok.app.");
    }

    if (appleTeamId && !appIds.some((appId) => appId.startsWith(`${appleTeamId}.`))) {
      errors.push("apple-app-site-association appIDs do not match APPLE_TEAM_ID.");
    }

    if (!appleTeamId) {
      warnings.push("APPLE_TEAM_ID is not set; verify the AASA appID manually before App Store release.");
    }
  }

  if (!fs.existsSync(assetlinksPath)) {
    errors.push("Missing public/.well-known/assetlinks.json for Android App Links.");
  } else {
    const parsed = readJsonFile(assetlinksPath, errors, "Invalid assetlinks.json JSON.");
    const entries = Array.isArray(parsed) ? parsed : [];
    const hasTokAndroidApp = entries.some((entry) => {
      const target = entry?.target || {};
      const fingerprints = Array.isArray(target.sha256_cert_fingerprints)
        ? target.sha256_cert_fingerprints.map(clean)
        : [];
      return (
        target.namespace === "android_app"
        && target.package_name === "com.tok.app"
        && fingerprints.length > 0
        && fingerprints.every((fingerprint) => !isPlaceholder(fingerprint))
      );
    });

    if (!hasTokAndroidApp) {
      errors.push("assetlinks.json must include com.tok.app with the Android release SHA-256 fingerprint.");
    }
  }
}

function inspectAndroidSigning(root, env, errors) {
  const keystoreProperties = path.join(root, "android", "keystore.properties");
  const hasKeystoreConfig = fs.existsSync(keystoreProperties)
    || clean(env.ANDROID_KEYSTORE_BASE64)
    || clean(env.ANDROID_KEYSTORE_PATH);

  if (!hasKeystoreConfig) {
    errors.push("Missing Android release keystore config at android/keystore.properties.");
  }
}

function inspectEdgeSecrets(env, errors) {
  for (const [name, pattern, message] of REQUIRED_EDGE_SECRETS) {
    const value = clean(env[name]);
    if (!pattern.test(value) || isPlaceholder(value)) {
      errors.push(message);
    }
  }
}

function readJsonFile(filePath, errors, message) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    errors.push(message);
    return null;
  }
}

function printResult(result) {
  console.log("Release readiness");
  console.log("=================");
  console.log(`Result: ${result.ok ? "OK" : "FAIL"}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  for (const warning of result.warnings) {
    console.log(`- Warning: ${warning}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = inspectReleaseReadiness();
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}
