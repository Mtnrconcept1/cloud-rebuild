import { createPrivateKey, sign } from "node:crypto";
import { appendFile } from "node:fs/promises";

const DEFAULT_BUNDLE_ID = "ch.thetok.app";
const APP_STORE_CONNECT_AUDIENCE = "appstoreconnect-v1";
const APP_STORE_CONNECT_API = "https://api.appstoreconnect.apple.com";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizePrivateKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  const trimmed = normalized.trim();

  if (!trimmed.includes("-----BEGIN PRIVATE KEY-----") || !trimmed.includes("-----END PRIVATE KEY-----")) {
    throw new Error("APP_STORE_CONNECT_PRIVATE_KEY is not a valid .p8 private key payload.");
  }

  return `${trimmed}\n`;
}

function createAppStoreConnectToken({ issuerId, keyId, privateKey }) {
  const issuedAt = Math.floor(Date.now() / 1000) - 5;
  const expiresAt = issuedAt + 5 * 60;
  const header = {
    alg: "ES256",
    kid: keyId,
    typ: "JWT",
  };
  const payload = {
    iss: issuerId,
    iat: issuedAt,
    exp: expiresAt,
    aud: APP_STORE_CONNECT_AUDIENCE,
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = createPrivateKey(privateKey);
  const signature = sign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

function apiErrorMessage(payload, status) {
  const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const detail = firstError?.detail || firstError?.title;
  return detail ? `App Store Connect returned HTTP ${status}: ${detail}` : `App Store Connect returned HTTP ${status}.`;
}

async function writeGithubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  await appendFile(outputFile, `${name}=${String(value).replaceAll("\n", " ")}\n`, "utf8");
}

async function main() {
  const issuerId = requireEnv("APP_STORE_CONNECT_ISSUER_ID");
  const keyId = requireEnv("APP_STORE_CONNECT_KEY_ID");
  const privateKey = normalizePrivateKey(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY"));
  const bundleId = process.env.IOS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;

  const token = createAppStoreConnectToken({ issuerId, keyId, privateKey });
  const url = new URL("/v1/apps", APP_STORE_CONNECT_API);
  url.searchParams.set("filter[bundleId]", bundleId);
  url.searchParams.set("limit", "2");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the error message deterministic and never dump an unexpected response body.
  }

  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, response.status));
  }

  const apps = Array.isArray(payload?.data) ? payload.data : [];
  if (apps.length === 0) {
    throw new Error(
      `No App Store Connect app record exists for ${bundleId}. Create the app record in App Store Connect with this exact Bundle ID, then rerun the workflow.`,
    );
  }

  if (apps.length > 1) {
    throw new Error(`More than one App Store Connect app matched ${bundleId}; refusing to choose one automatically.`);
  }

  const app = apps[0];
  const attributes = app.attributes || {};
  const appName = attributes.name || "Thetok";
  const primaryLocale = attributes.primaryLocale || "unknown";

  console.log(`App Store Connect authentication succeeded for ${appName} (${bundleId}).`);
  console.log(`App Store Connect app id: ${app.id}; primary locale: ${primaryLocale}.`);

  await writeGithubOutput("app_id", app.id);
  await writeGithubOutput("app_name", appName);
  await writeGithubOutput("primary_locale", primaryLocale);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`App Store Connect preflight failed: ${message}`);
  process.exit(1);
});
