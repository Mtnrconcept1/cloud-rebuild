import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const TERRITORY = "CHE";
const SUBSCRIPTIONS = [
  { id: "6800165116", productId: "ch.thetok.app.tokone.monthly", targetPrice: 9.9, uploadReviewScreenshot: true },
  { id: "6800167330", productId: "ch.thetok.app.tokone.yearly", targetPrice: 89.9, uploadReviewScreenshot: false },
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePrivateKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  const trimmed = normalized.trim();
  if (!trimmed.includes("-----BEGIN PRIVATE KEY-----") || !trimmed.includes("-----END PRIVATE KEY-----")) {
    throw new Error("APP_STORE_CONNECT_PRIVATE_KEY is invalid.");
  }
  return `${trimmed}\n`;
}

const credentials = {
  issuerId: requireEnv("APP_STORE_CONNECT_ISSUER_ID"),
  keyId: requireEnv("APP_STORE_CONNECT_KEY_ID"),
  privateKey: normalizePrivateKey(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY")),
};

function base64Url(value) { return Buffer.from(value).toString("base64url"); }
function createToken() {
  const iat = Math.floor(Date.now() / 1000) - 5;
  const signingInput = `${base64Url(JSON.stringify({ alg: "ES256", kid: credentials.keyId, typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: credentials.issuerId, iat, exp: iat + 300, aud: AUDIENCE }))}`;
  const signature = sign("sha256", Buffer.from(signingInput), { key: createPrivateKey(credentials.privateKey), dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function errorMessage(payload, status, context) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const detail = errors.map((item) => [item?.code, item?.title, item?.detail].filter(Boolean).join(" — ")).filter(Boolean).join(" | ");
  return `${context}: HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(method, pathname, { body, allow404 = false, retries = 3 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(new URL(pathname, API), {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${createToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    if (allow404 && response.status === 404) return null;
    if (response.ok) return payload;
    lastError = new Error(errorMessage(payload, response.status, `${method} ${pathname}`));
    if (response.status < 500 || attempt === retries || method !== "GET") throw lastError;
    await sleep(750 * (attempt + 1));
  }
  throw lastError || new Error(`${method} ${pathname} failed.`);
}

async function listPrices(subscriptionId) {
  const url = new URL(`/v1/subscriptions/${subscriptionId}/prices`, API);
  url.searchParams.set("filter[territory]", TERRITORY);
  url.searchParams.set("include", "subscriptionPricePoint,territory");
  url.searchParams.set("fields[subscriptionPrices]", "startDate,preserved,planType,subscriptionPricePoint,territory");
  url.searchParams.set("fields[subscriptionPricePoints]", "customerPrice,proceeds,proceedsYear2");
  url.searchParams.set("limit", "200");
  const payload = await api("GET", `${url.pathname}${url.search}`);
  const points = new Map((payload?.included || []).filter((row) => row.type === "subscriptionPricePoints").map((row) => [row.id, row]));
  return (payload?.data || []).map((row) => {
    const pricePointId = row.relationships?.subscriptionPricePoint?.data?.id;
    return {
      id: row.id,
      startDate: row.attributes?.startDate ?? null,
      pricePointId: pricePointId ?? null,
      customerPrice: pricePointId ? Number(points.get(pricePointId)?.attributes?.customerPrice) : null,
    };
  });
}

async function findPricePoint(subscriptionId, targetPrice) {
  const url = new URL(`/v1/subscriptions/${subscriptionId}/pricePoints`, API);
  url.searchParams.set("filter[territory]", TERRITORY);
  url.searchParams.set("fields[subscriptionPricePoints]", "customerPrice,proceeds,proceedsYear2");
  url.searchParams.set("limit", "8000");
  const payload = await api("GET", `${url.pathname}${url.search}`);
  const matches = (payload?.data || []).filter((row) => Math.abs(Number(row.attributes?.customerPrice) - targetPrice) < 0.001);
  if (matches.length !== 1) throw new Error(`Expected exactly one Swiss price point at CHF ${targetPrice.toFixed(2)} for ${subscriptionId}; found ${matches.length}.`);
  return matches[0];
}

function tomorrowDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function ensureCanonicalPrice(target) {
  let prices = await listPrices(target.id);
  if (prices.some((row) => Math.abs(Number(row.customerPrice) - target.targetPrice) < 0.001)) {
    console.log(`${target.productId}: canonical CHF ${target.targetPrice.toFixed(2)} price already configured.`);
    return prices;
  }

  const pricePoint = await findPricePoint(target.id, target.targetPrice);
  const startDate = tomorrowDate();
  await api("POST", "/v1/subscriptionPrices", {
    body: {
      data: {
        type: "subscriptionPrices",
        attributes: { startDate, preserveCurrentPrice: false },
        relationships: {
          subscription: { data: { type: "subscriptions", id: target.id } },
          subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: pricePoint.id } },
        },
      },
    },
  });
  console.log(`${target.productId}: scheduled CHF ${target.targetPrice.toFixed(2)} from ${startDate}.`);

  prices = await listPrices(target.id);
  if (!prices.some((row) => Math.abs(Number(row.customerPrice) - target.targetPrice) < 0.001)) {
    throw new Error(`${target.productId}: canonical price was not visible after creation.`);
  }
  return prices;
}

async function getReviewScreenshot(subscriptionId) {
  return api("GET", `/v1/subscriptions/${subscriptionId}/appStoreReviewScreenshot?fields[subscriptionAppStoreReviewScreenshots]=fileSize,fileName,sourceFileChecksum,assetDeliveryState,uploadOperations`, { allow404: true });
}

async function uploadBinary(buffer, operations) {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("App Store Connect returned no screenshot upload operations.");
  for (const operation of operations) {
    const offset = Number(operation?.offset);
    const length = Number(operation?.length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > buffer.length) {
      throw new Error("Invalid App Store Connect upload operation range.");
    }
    const headers = Object.fromEntries((operation.requestHeaders || []).filter((header) => header?.name && header?.value).map((header) => [header.name, header.value]));
    const response = await fetch(operation.url, {
      method: operation.method || "PUT",
      headers,
      body: buffer.subarray(offset, offset + length),
    });
    if (!response.ok) throw new Error(`Subscription review screenshot binary upload failed with HTTP ${response.status}.`);
  }
}

async function ensureReviewScreenshot(subscriptionId) {
  const current = await getReviewScreenshot(subscriptionId);
  if (current?.data?.id) {
    console.log(`Subscription ${subscriptionId}: review screenshot already exists (${current.data.id}).`);
    return current.data;
  }

  const filePath = requireEnv("TOK_ONE_REVIEW_SCREENSHOT_PATH");
  const buffer = await readFile(filePath);
  const fileStat = await stat(filePath);
  const fileName = path.basename(filePath);
  if (fileStat.size <= 0) throw new Error("Tok One review screenshot is empty.");

  const reservation = await api("POST", "/v1/subscriptionAppStoreReviewScreenshots", {
    body: {
      data: {
        type: "subscriptionAppStoreReviewScreenshots",
        attributes: { fileSize: fileStat.size, fileName },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
        },
      },
    },
  });
  const screenshot = reservation?.data;
  if (!screenshot?.id) throw new Error("App Store Connect did not return a review screenshot reservation id.");

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

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const committed = await getReviewScreenshot(subscriptionId);
    const state = committed?.data?.attributes?.assetDeliveryState?.state || committed?.data?.attributes?.assetDeliveryState;
    if (state === "COMPLETE") {
      console.log(`Subscription ${subscriptionId}: review screenshot ${fileName} is COMPLETE.`);
      return committed.data;
    }
    if (state === "FAILED") throw new Error(`Subscription ${subscriptionId}: review screenshot processing failed.`);
    await sleep(1000);
  }
  throw new Error(`Subscription ${subscriptionId}: review screenshot did not reach COMPLETE.`);
}

const results = [];
for (const target of SUBSCRIPTIONS) {
  const prices = await ensureCanonicalPrice(target);
  const screenshot = target.uploadReviewScreenshot ? await ensureReviewScreenshot(target.id) : null;
  const detail = await api("GET", `/v1/subscriptions/${target.id}?fields[subscriptions]=name,productId,state,subscriptionPeriod,reviewNote,groupLevel`);
  results.push({
    id: target.id,
    productId: target.productId,
    state: detail?.data?.attributes?.state || "UNKNOWN",
    targetPrice: target.targetPrice,
    prices,
    reviewScreenshotId: screenshot?.id || null,
  });
}

console.log(JSON.stringify({ prepared: true, subscriptions: results }, null, 2));
