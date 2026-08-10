import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const VERSION_ID = "c4210449-0d31-465a-bb58-739fbf2cda92";

function need(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizeKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  return `${normalized.trim()}\n`;
}

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function token() {
  const now = Math.floor(Date.now() / 1000) - 5;
  const header = { alg: "ES256", kid: need("APP_STORE_CONNECT_KEY_ID"), typ: "JWT" };
  const payload = {
    iss: need("APP_STORE_CONNECT_ISSUER_ID"),
    iat: now,
    exp: now + 300,
    aud: "appstoreconnect-v1",
  };
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(input), {
    key: createPrivateKey(normalizeKey(need("APP_STORE_CONNECT_PRIVATE_KEY"))),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${signature.toString("base64url")}`;
}

const AUTH = token();

function normalizeErrors(payload, status) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (!errors.length) return [{ status: String(status), code: null, title: null, detail: null, source: null }];
  return errors.map((error) => ({
    status: error.status || String(status),
    code: error.code || null,
    title: error.title || null,
    detail: error.detail || null,
    source: error.source || null,
  }));
}

async function request(path, { method = "GET", body, allow404 = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${AUTH}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let payload = null;
  if (response.status !== 204) {
    try { payload = await response.json(); } catch { /* handled below */ }
  }

  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(JSON.stringify(normalizeErrors(payload, response.status)));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function main() {
  const existing = await request(`/v1/appStoreVersions/${VERSION_ID}/appStoreVersionSubmission`, { allow404: true });
  if (existing?.data?.id) {
    console.log(`APP_STORE_VERSION_SUBMISSION_ALREADY_EXISTS=${existing.data.id}`);
    return;
  }

  try {
    const created = await request(`/v1/appStoreVersionSubmissions`, {
      method: "POST",
      body: {
        data: {
          type: "appStoreVersionSubmissions",
          relationships: {
            appStoreVersion: {
              data: { type: "appStoreVersions", id: VERSION_ID },
            },
          },
        },
      },
    });
    console.log(`APP_STORE_VERSION_SUBMISSION_CREATED=${created?.data?.id || "unknown"}`);
  } catch (error) {
    console.log(`APP_STORE_VERSION_SUBMIT_ERRORS=${JSON.stringify(normalizeErrors(error.payload, error.status))}`);
    throw error;
  }
}

main().catch((error) => {
  console.error(`Final submit audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
