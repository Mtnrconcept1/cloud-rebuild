import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const YEARLY_SUBSCRIPTION_ID = "6800167330";

function need(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizeKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  return `${normalized.trim()}\n`;
}

const issuerId = need("APP_STORE_CONNECT_ISSUER_ID");
const keyId = need("APP_STORE_CONNECT_KEY_ID");
const privateKey = normalizeKey(need("APP_STORE_CONNECT_PRIVATE_KEY"));
const b64 = (value) => Buffer.from(value).toString("base64url");

function token() {
  const iat = Math.floor(Date.now() / 1000) - 5;
  const input = `${b64(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.${b64(JSON.stringify({ iss: issuerId, iat, exp: iat + 300, aud: AUDIENCE }))}`;
  const signature = sign("sha256", Buffer.from(input), { key: createPrivateKey(privateKey), dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatError(payload, status, context) {
  const detail = (payload?.errors || []).map((item) => [item?.code, item?.title, item?.detail].filter(Boolean).join(" — ")).filter(Boolean).join(" | ");
  return `${context}: HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

async function api(method, pathname, { body, allow404 = false } = {}) {
  const response = await fetch(new URL(pathname, API), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token()}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(formatError(payload, response.status, `${method} ${pathname}`));
  return payload;
}

async function getScreenshot() {
  return api("GET", `/v1/subscriptions/${YEARLY_SUBSCRIPTION_ID}/appStoreReviewScreenshot?fields[subscriptionAppStoreReviewScreenshots]=fileSize,fileName,sourceFileChecksum,assetDeliveryState`, { allow404: true });
}

async function uploadBinary(buffer, operations) {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("No App Store upload operations returned.");
  for (const operation of operations) {
    const offset = Number(operation?.offset);
    const length = Number(operation?.length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > buffer.length) {
      throw new Error("Invalid App Store screenshot upload range.");
    }
    const headers = Object.fromEntries((operation.requestHeaders || []).filter((header) => header?.name && header?.value).map((header) => [header.name, header.value]));
    const response = await fetch(operation.url, {
      method: operation.method || "PUT",
      headers,
      body: buffer.subarray(offset, offset + length),
    });
    if (!response.ok) throw new Error(`Annual review screenshot binary upload failed with HTTP ${response.status}.`);
  }
}

const existing = await getScreenshot();
if (existing?.data?.id) {
  console.log(`Annual Tok One review screenshot already exists: ${existing.data.id}`);
  process.exit(0);
}

const filePath = need("TOK_ONE_REVIEW_SCREENSHOT_PATH");
const buffer = await readFile(filePath);
const fileStat = await stat(filePath);
const fileName = path.basename(filePath);
if (fileStat.size <= 0) throw new Error("Annual Tok One review screenshot is empty.");

const reservation = await api("POST", "/v1/subscriptionAppStoreReviewScreenshots", {
  body: {
    data: {
      type: "subscriptionAppStoreReviewScreenshots",
      attributes: { fileSize: fileStat.size, fileName },
      relationships: {
        subscription: { data: { type: "subscriptions", id: YEARLY_SUBSCRIPTION_ID } },
      },
    },
  },
});
const screenshot = reservation?.data;
if (!screenshot?.id) throw new Error("App Store Connect did not return an annual review screenshot reservation id.");

try {
  await uploadBinary(buffer, screenshot.attributes?.uploadOperations);
  const checksum = createHash("md5").update(buffer).digest("hex");
  await api("PATCH", `/v1/subscriptionAppStoreReviewScreenshots/${screenshot.id}`, {
    body: {
      data: {
        type: "subscriptionAppStoreReviewScreenshots",
        id: screenshot.id,
        attributes: { uploaded: true, sourceFileChecksum: checksum },
      },
    },
  });
} catch (error) {
  await api("DELETE", `/v1/subscriptionAppStoreReviewScreenshots/${screenshot.id}`).catch(() => undefined);
  throw error;
}

for (let attempt = 1; attempt <= 15; attempt += 1) {
  const committed = await getScreenshot();
  const state = committed?.data?.attributes?.assetDeliveryState?.state || committed?.data?.attributes?.assetDeliveryState;
  console.log(`ANNUAL_SCREENSHOT_POLL=${attempt} state=${state || "UNKNOWN"}`);
  if (state === "COMPLETE") {
    console.log(`Annual Tok One review screenshot COMPLETE: ${committed.data.id}`);
    process.exit(0);
  }
  if (state === "FAILED") throw new Error("Annual Tok One review screenshot processing failed.");
  await sleep(1000);
}
throw new Error("Annual Tok One review screenshot did not reach COMPLETE.");
