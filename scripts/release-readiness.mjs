import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";

const DEFAULT_ENV_FILES = [".env.production", ".env.production.local"];
const REQUIRED_EDGE_SECRETS = [
  [
    ["STRIPE_PERSONNAL_SECRET_KEY", "STRIPE_PERSONAL_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE", "STRIPE_SECRET_KEY"],
    /^sk_live_/,
    "Missing STRIPE_PERSONNAL_SECRET_KEY, STRIPE_PERSONAL_SECRET_KEY, STRIPE_SECRET_KEY_LIVE or STRIPE_SECRET_KEY live secret for production payments.",
  ],
  [
    ["STRIPE_WEBHOOK_SECRET", "STRIPE_LIVE_WEBHOOK"],
    /^whsec_/,
    "Missing STRIPE_WEBHOOK_SECRET or STRIPE_LIVE_WEBHOOK for production payment capture.",
  ],
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
  const strict = typeof options.strict === "boolean"
    ? options.strict
    : isTruthy(env.RELEASE_READINESS_STRICT);
  const target = clean(options.target || env.RELEASE_READINESS_TARGET).toLowerCase() || "full";

  const errors = [];
  const warnings = [];
  const report = createReporter({ errors, warnings, strict });
  const providerBootstrapGraceActive = isProviderBootstrapGraceActive(env, options.now);

  if (!["full", "web"].includes(target)) {
    report.required("RELEASE_READINESS_TARGET must be either full or web.");
  }

  inspectStripe(env, report, providerBootstrapGraceActive);
  if (target === "full") {
    inspectMobileAssociations(root, env, report);
    inspectAndroidSigning(root, env, report);
  }
  inspectEdgeSecrets(env, report);
  inspectSupabaseRuntimeSecurity(env, report, providerBootstrapGraceActive);
  inspectFirebaseServiceAccount(env, report);
  inspectSupabaseAuthSecurity(env, report);

  return {
    ok: errors.length === 0,
    strict,
    target,
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

function isTruthy(value) {
  return ["1", "true", "yes", "strict", "production"].includes(clean(value).toLowerCase());
}

function isProviderBootstrapGraceActive(env, nowOption) {
  const rawUntil = clean(env.PROVIDER_BOOTSTRAP_GRACE_UNTIL);
  const until = Date.parse(rawUntil);
  if (!rawUntil || !Number.isFinite(until)) return false;

  const nowValue = typeof nowOption === "function" ? nowOption() : nowOption;
  const now = nowValue instanceof Date ? nowValue : new Date();
  return Number.isFinite(now.getTime()) && now.getTime() < until;
}

function createReporter({ errors, warnings, strict }) {
  return {
    required(message) {
      if (strict) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    },
    warning(message) {
      warnings.push(message);
    },
  };
}

function inspectStripe(env, report, providerBootstrapGraceActive) {
  const publishable = clean(env.VITE_STRIPE_PUBLISHABLE_KEY);
  if (/^pk_live_/.test(publishable)) return;

  if (providerBootstrapGraceActive) {
    report.warning(
      `Temporary provider bootstrap grace is active until ${clean(env.PROVIDER_BOOTSTRAP_GRACE_UNTIL)}: Stripe publishable key is absent; client Stripe checkout remains unavailable.`,
    );
    return;
  }

  report.required("Missing VITE_STRIPE_PUBLISHABLE_KEY live publishable key for production checkout.");
}

function inspectMobileAssociations(root, env, report) {
  const aasaPath = path.join(root, "public", ".well-known", "apple-app-site-association");
  const assetlinksPath = path.join(root, "public", ".well-known", "assetlinks.json");

  if (!fs.existsSync(aasaPath)) {
    report.required("Missing public/.well-known/apple-app-site-association for iOS Universal Links.");
  } else {
    const parsed = readJsonFile(aasaPath, report, "Invalid apple-app-site-association JSON.");
    const appIds = parsed?.applinks?.details
      ?.flatMap((detail) => Array.isArray(detail.appIDs) ? detail.appIDs : [])
      ?.map(clean) || [];
    const appleTeamId = clean(env.APPLE_TEAM_ID || env.IOS_APPLE_TEAM_ID);

    if (appIds.length === 0 || appIds.some(isPlaceholder)) {
      report.required("apple-app-site-association must include a real Apple Team ID appID for com.tok.app.");
    }

    if (!/^[A-Z0-9]{10}$/.test(appleTeamId)) {
      report.required("Missing or invalid APPLE_TEAM_ID; expected exactly 10 uppercase letters or digits.");
    } else {
      const expectedAppId = `${appleTeamId}.com.tok.app`;
      if (appIds.length !== 1 || appIds[0] !== expectedAppId) {
        report.required("apple-app-site-association must contain exactly APPLE_TEAM_ID.com.tok.app.");
      }
    }
  }

  if (!fs.existsSync(assetlinksPath)) {
    report.required("Missing public/.well-known/assetlinks.json for Android App Links.");
  } else {
    const parsed = readJsonFile(assetlinksPath, report, "Invalid assetlinks.json JSON.");
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
      report.required("assetlinks.json must include com.tok.app with the Android release SHA-256 fingerprint.");
    }
  }
}

function inspectAndroidSigning(root, env, report) {
  const keystoreProperties = path.join(root, "android", "keystore.properties");
  const hasKeystoreConfig = fs.existsSync(keystoreProperties)
    || clean(env.ANDROID_KEYSTORE_BASE64)
    || clean(env.ANDROID_KEYSTORE_PATH);

  if (!hasKeystoreConfig) {
    report.required("Missing Android release keystore config at android/keystore.properties.");
  }
}

function inspectEdgeSecrets(env, report) {
  for (const [names, pattern, message] of REQUIRED_EDGE_SECRETS) {
    const candidates = Array.isArray(names) ? names : [names];
    const value = candidates.map((name) => clean(env[name])).find((candidate) => candidate);
    if (!pattern.test(value) || isPlaceholder(value)) {
      report.required(message);
    }
  }
}

function inspectSupabaseRuntimeSecurity(env, report, providerBootstrapGraceActive) {
  const cronSecret = clean(env.INTERNAL_CRON_SECRET || env.CRON_SECRET);
  const cronConfirmed = hasConfirmedEvidence(
    env.SUPABASE_INTERNAL_CRON_VAULT_CONFIRMED,
    env.SUPABASE_INTERNAL_CRON_VAULT_EVIDENCE,
  );
  if (!(/^.{16,}$/.test(cronSecret) && !isPlaceholder(cronSecret)) && !cronConfirmed) {
    report.required("Missing live proof of the Supabase Vault internal cron secret and verifier.");
  }

  const resendApiKey = clean(env.RESEND_API_KEY);
  const resendConfirmed = hasConfirmedEvidence(
    env.SUPABASE_RESEND_SECRET_CONFIRMED,
    env.SUPABASE_RESEND_SECRET_EVIDENCE,
  );
  if (!(/^re_/.test(resendApiKey) && !isPlaceholder(resendApiKey)) && !resendConfirmed) {
    if (providerBootstrapGraceActive) {
      report.warning(
        `Temporary provider bootstrap grace is active until ${clean(env.PROVIDER_BOOTSTRAP_GRACE_UNTIL)}: RESEND_API_KEY is absent; transactional email delivery remains unavailable.`,
      );
    } else {
      report.required("Missing live proof that RESEND_API_KEY is installed in Supabase production Edge secrets.");
    }
  }

  const emailFrom = clean(env.EMAIL_FROM) || "Tok <noreply@thetok.ch>";
  if (!/@/.test(emailFrom) || isPlaceholder(emailFrom)) {
    report.required("EMAIL_FROM must be a valid production transactional sender.");
  }
}

function hasConfirmedEvidence(confirmedValue, evidenceValue) {
  const confirmed = clean(confirmedValue).toLowerCase();
  const evidence = clean(evidenceValue);
  return ["1", "true", "yes", "active", "confirmed"].includes(confirmed)
    && !isPlaceholder(evidence)
    && evidence.length >= 20;
}

function inspectFirebaseServiceAccount(env, report) {
  const serviceAccount = clean(env.FIREBASE_SERVICE_ACCOUNT);
  const separateEnv = {
    type: "service_account",
    project_id: clean(env.FIREBASE_PROJECT_ID),
    client_email: clean(env.FIREBASE_CLIENT_EMAIL),
    private_key: clean(env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n"),
    token_uri: clean(env.FIREBASE_TOKEN_URI) || "https://oauth2.googleapis.com/token",
  };

  if (serviceAccount) {
    const parsed = parseFirebaseServiceAccount(serviceAccount);
    if (parsed && isValidFirebaseServiceAccount(parsed)) return;
    report.required("FIREBASE_SERVICE_ACCOUNT must be valid service account JSON or base64 JSON with project_id, client_email, private_key and token_uri.");
    return;
  }

  if (isValidFirebaseServiceAccount(separateEnv)) return;
  report.required("Missing valid Firebase service account config for production push delivery.");
}

function inspectSupabaseAuthSecurity(env, report) {
  const confirmed = clean(env.SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED).toLowerCase();
  const evidence = clean(env.SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE);
  const accepted = new Set(["1", "true", "yes", "active", "confirmed"]);

  if (!accepted.has(confirmed)) {
    report.required("Missing SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED=true after verifying Supabase Auth leaked password protection for production.");
  }

  if (isPlaceholder(evidence) || evidence.length < 12) {
    report.required("Missing SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE with Dashboard/API proof for issue #204.");
  }
}

function parseFirebaseServiceAccount(value) {
  const candidates = [value, decodeBase64Json(value)].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next representation.
    }
  }

  return null;
}

function decodeBase64Json(value) {
  try {
    const decoded = Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf8").trim();
    return decoded.startsWith("{") ? decoded : null;
  } catch {
    return null;
  }
}

function isValidFirebaseServiceAccount(value) {
  const projectId = clean(value?.project_id);
  const clientEmail = clean(value?.client_email);
  const privateKey = clean(value?.private_key).replace(/\\n/g, "\n");
  const tokenUri = clean(value?.token_uri) || "https://oauth2.googleapis.com/token";

  return (
    projectId.length > 0
    && clientEmail.endsWith(".gserviceaccount.com")
    && privateKey.includes("-----BEGIN PRIVATE KEY-----")
    && privateKey.includes("-----END PRIVATE KEY-----")
    && /^https:\/\//.test(tokenUri)
    && !isPlaceholder(projectId)
    && !isPlaceholder(clientEmail)
  );
}

function readJsonFile(filePath, report, message) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    report.required(message);
    return null;
  }
}

function printResult(result) {
  console.log("Release readiness");
  console.log("=================");
  console.log(`Mode: ${result.strict ? "strict" : "advisory"}`);
  console.log(`Target: ${result.target}`);
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
  const args = process.argv.slice(2);
  const strict = args.includes("--strict") ? true : undefined;
  const targetArgument = args.find((argument) => argument.startsWith("--target="));
  const target = targetArgument ? targetArgument.slice("--target=".length) : undefined;
  const result = inspectReleaseReadiness({ strict, target });
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}
