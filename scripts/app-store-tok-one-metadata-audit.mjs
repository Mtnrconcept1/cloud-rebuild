import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const GROUP_ID = "22301012";
const SUBSCRIPTIONS = [
  { id: "6800165116", productId: "ch.thetok.app.tokone.monthly" },
  { id: "6800167330", productId: "ch.thetok.app.tokone.yearly" },
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePrivateKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  return `${normalized.trim()}\n`;
}

const issuerId = requireEnv("APP_STORE_CONNECT_ISSUER_ID");
const keyId = requireEnv("APP_STORE_CONNECT_KEY_ID");
const privateKey = normalizePrivateKey(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY"));
const base64Url = (value) => Buffer.from(value).toString("base64url");

function token() {
  const iat = Math.floor(Date.now() / 1000) - 5;
  const signingInput = `${base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: issuerId, iat, exp: iat + 300, aud: AUDIENCE }))}`;
  const signature = sign("sha256", Buffer.from(signingInput), { key: createPrivateKey(privateKey), dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${signature.toString("base64url")}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function get(pathname, { allow404 = false, retries = 3 } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(new URL(pathname, API), { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } });
    const text = await response.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    if (allow404 && response.status === 404) return null;
    if (response.ok) return payload;
    const detail = (payload?.errors || []).map((item) => item?.detail || item?.title || item?.code).filter(Boolean).join(" | ");
    last = new Error(`GET ${pathname}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
    if (response.status < 500 || attempt === retries) throw last;
    await sleep(500 * (attempt + 1));
  }
  throw last;
}

const groupLocalization = await get(`/v1/subscriptionGroups/${GROUP_ID}/subscriptionGroupLocalizations?fields[subscriptionGroupLocalizations]=name,customAppName,locale,state&limit=200`);
const groupLocalizations = (groupLocalization?.data || []).map((row) => ({ id: row.id, ...row.attributes }));

const subscriptions = [];
for (const target of SUBSCRIPTIONS) {
  const availability = await get(`/v1/subscriptions/${target.id}/subscriptionAvailability?include=availableTerritories&limit[availableTerritories]=200`, { allow404: true });
  const territoryIds = (availability?.included || []).filter((row) => row.type === "territories").map((row) => row.id).sort();
  const images = await get(`/v1/subscriptions/${target.id}/images?fields[subscriptionImages]=fileName,fileSize,assetDeliveryState&limit=50`, { allow404: true }).catch((error) => ({ error: String(error) }));
  subscriptions.push({
    ...target,
    availabilityId: availability?.data?.id || null,
    availableInNewTerritories: availability?.data?.attributes?.availableInNewTerritories ?? null,
    territories: territoryIds,
    images: (images?.data || []).map((row) => ({ id: row.id, ...row.attributes })),
    imagesError: images?.error || null,
  });
}

console.log(JSON.stringify({ groupId: GROUP_ID, groupLocalizations, subscriptions }, null, 2));
