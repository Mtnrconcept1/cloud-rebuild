import { createPrivateKey, sign } from "node:crypto";
import { appendFile } from "node:fs/promises";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const BUNDLE_ID = "ch.thetok.app";
const GROUP_NAME = "Tok One";
const TERRITORY = "CHE";
const TARGETS = new Map([
  ["ch.thetok.app.tokone.monthly", 9.9],
  ["ch.thetok.app.tokone.yearly", 89.9],
]);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePrivateKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n")
    ? value.replaceAll("\\n", "\n")
    : value;
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

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function token() {
  const iat = Math.floor(Date.now() / 1000) - 5;
  const header = { alg: "ES256", kid: credentials.keyId, typ: "JWT" };
  const payload = { iss: credentials.issuerId, iat, exp: iat + 300, aud: AUDIENCE };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(credentials.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function appleError(payload, status, context) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const detail = errors.map((item) => [item?.code, item?.title, item?.detail].filter(Boolean).join(" — ")).filter(Boolean).join(" | ");
  return `${context}: HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(pathname, { allow404 = false, retries = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(new URL(pathname, API), {
      headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (allow404 && response.status === 404) return null;
    if (response.ok) return payload;

    lastError = new Error(appleError(payload, response.status, `GET ${pathname}`));
    if (response.status < 500 || attempt === retries) throw lastError;
    await sleep(500 * (attempt + 1));
  }
  throw lastError || new Error(`GET ${pathname} failed.`);
}

async function resolveApp() {
  const url = new URL("/v1/apps", API);
  url.searchParams.set("filter[bundleId]", BUNDLE_ID);
  url.searchParams.set("fields[apps]", "name,bundleId,primaryLocale,subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox");
  url.searchParams.set("limit", "2");
  const payload = await request(`${url.pathname}${url.search}`);
  if ((payload?.data || []).length !== 1) throw new Error(`Expected exactly one app for ${BUNDLE_ID}.`);
  return payload.data[0];
}

async function resolveGroup(appId) {
  const payload = await request(`/v1/apps/${appId}/subscriptionGroups?fields[subscriptionGroups]=referenceName&limit=200`);
  const rows = (payload?.data || []).filter((row) => row.attributes?.referenceName === GROUP_NAME);
  if (rows.length !== 1) throw new Error(`Expected exactly one ${GROUP_NAME} group; found ${rows.length}.`);
  return rows[0];
}

async function listSubscriptions(groupId) {
  const payload = await request(`/v1/subscriptionGroups/${groupId}/subscriptions?fields[subscriptions]=name,productId,state,subscriptionPeriod,reviewNote,groupLevel&limit=200`);
  return payload?.data || [];
}

async function listPrices(subscriptionId) {
  const url = new URL(`/v1/subscriptions/${subscriptionId}/prices`, API);
  url.searchParams.set("filter[territory]", TERRITORY);
  url.searchParams.set("include", "subscriptionPricePoint,territory");
  url.searchParams.set("fields[subscriptionPrices]", "startDate,preserved,planType,subscriptionPricePoint,territory");
  url.searchParams.set("fields[subscriptionPricePoints]", "customerPrice,proceeds,proceedsYear2");
  url.searchParams.set("fields[territories]", "currency");
  url.searchParams.set("limit", "200");
  const payload = await request(`${url.pathname}${url.search}`);
  const points = new Map((payload?.included || []).filter((row) => row.type === "subscriptionPricePoints").map((row) => [row.id, row]));
  return (payload?.data || []).map((row) => {
    const pointId = row.relationships?.subscriptionPricePoint?.data?.id;
    return {
      id: row.id,
      startDate: row.attributes?.startDate ?? null,
      preserved: row.attributes?.preserved ?? null,
      planType: row.attributes?.planType ?? null,
      pricePointId: pointId ?? null,
      customerPrice: pointId ? Number(points.get(pointId)?.attributes?.customerPrice) : null,
    };
  });
}

async function listLocalizations(subscriptionId) {
  try {
    const payload = await request(`/v1/subscriptions/${subscriptionId}/subscriptionLocalizations?fields[subscriptionLocalizations]=name,locale,description&limit=200`, { retries: 3 });
    return (payload?.data || []).map((row) => ({ id: row.id, ...row.attributes }));
  } catch (error) {
    return [{ locale: "unavailable", error: error instanceof Error ? error.message : String(error) }];
  }
}

async function readReviewScreenshot(subscriptionId) {
  const payload = await request(`/v1/subscriptions/${subscriptionId}/appStoreReviewScreenshot?fields[subscriptionAppStoreReviewScreenshots]=fileSize,fileName,sourceFileChecksum,assetDeliveryState`, { allow404: true });
  if (!payload?.data) return null;
  return {
    id: payload.data.id,
    fileName: payload.data.attributes?.fileName ?? null,
    fileSize: payload.data.attributes?.fileSize ?? null,
    sourceFileChecksum: payload.data.attributes?.sourceFileChecksum ?? null,
    assetDeliveryState: payload.data.attributes?.assetDeliveryState ?? null,
  };
}

const app = await resolveApp();
const group = await resolveGroup(app.id);
const subscriptions = await listSubscriptions(group.id);
const results = [];

for (const subscription of subscriptions) {
  const productId = subscription.attributes?.productId || "";
  if (!TARGETS.has(productId)) continue;
  const targetPrice = TARGETS.get(productId);
  const prices = await listPrices(subscription.id);
  const localizations = await listLocalizations(subscription.id);
  const reviewScreenshot = await readReviewScreenshot(subscription.id);
  results.push({
    id: subscription.id,
    productId,
    state: subscription.attributes?.state || "UNKNOWN",
    period: subscription.attributes?.subscriptionPeriod || null,
    targetPrice,
    targetPricePresent: prices.some((row) => Math.abs(Number(row.customerPrice) - targetPrice) < 0.001),
    prices,
    localizations,
    reviewScreenshot,
    reviewNotePresent: Boolean(String(subscription.attributes?.reviewNote || "").trim()),
  });
}

const output = {
  app: {
    id: app.id,
    name: app.attributes?.name,
    bundleId: app.attributes?.bundleId,
    notificationProduction: app.attributes?.subscriptionStatusUrl,
    notificationProductionVersion: app.attributes?.subscriptionStatusUrlVersion,
    notificationSandbox: app.attributes?.subscriptionStatusUrlForSandbox,
    notificationSandboxVersion: app.attributes?.subscriptionStatusUrlVersionForSandbox,
  },
  group: { id: group.id, name: group.attributes?.referenceName },
  subscriptions: results,
};

console.log(JSON.stringify(output, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "## Tok One — App Store readiness audit",
    "",
    `- App: ${output.app.name} (${output.app.id})`,
    `- Bundle: \`${output.app.bundleId}\``,
    `- Group: ${output.group.name} (${output.group.id})`,
    `- Notifications production: ${output.app.notificationProductionVersion || "none"}`,
    `- Notifications sandbox: ${output.app.notificationSandboxVersion || "none"}`,
    "",
    "| Product | State | Target | Target configured | Review screenshot | Localization |",
    "|---|---|---:|---|---|---|",
    ...results.map((row) => `| \`${row.productId}\` | ${row.state} | CHF ${row.targetPrice.toFixed(2)} | ${row.targetPricePresent ? "yes" : "no"} | ${row.reviewScreenshot ? "yes" : "no"} | ${row.localizations.map((loc) => loc.locale).join(", ") || "none"} |`),
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, "utf8");
}
