import { createPrivateKey, sign } from "node:crypto";
import { appendFile } from "node:fs/promises";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const APP_ID = "6799776439";
const BUNDLE_ID = "ch.thetok.app";
const GROUP_ID = "22301012";
const TERRITORY = "CHE";
const SUBSCRIPTIONS = [
  { id: "6800165116", productId: "ch.thetok.app.tokone.monthly", targetPrice: 9.9 },
  { id: "6800167330", productId: "ch.thetok.app.tokone.yearly", targetPrice: 89.9 },
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
function token() {
  const iat = Math.floor(Date.now() / 1000) - 5;
  const signingInput = `${base64Url(JSON.stringify({ alg: "ES256", kid: credentials.keyId, typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: credentials.issuerId, iat, exp: iat + 300, aud: AUDIENCE }))}`;
  const signature = sign("sha256", Buffer.from(signingInput), { key: createPrivateKey(credentials.privateKey), dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function appleError(payload, status, context) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const detail = errors.map((item) => [item?.code, item?.title, item?.detail].filter(Boolean).join(" — ")).filter(Boolean).join(" | ");
  return `${context}: HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(pathname, { allow404 = false, retries = 4 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(new URL(pathname, API), { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } });
    const text = await response.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    if (allow404 && response.status === 404) return null;
    if (response.ok) return payload;
    lastError = new Error(appleError(payload, response.status, `GET ${pathname}`));
    if (response.status < 500 || attempt === retries) throw lastError;
    await sleep(750 * (attempt + 1));
  }
  throw lastError || new Error(`GET ${pathname} failed.`);
}

async function bestEffort(pathname, options = {}) {
  try { return { payload: await request(pathname, options), error: null }; }
  catch (error) { return { payload: null, error: error instanceof Error ? error.message : String(error) }; }
}

async function readPrices(subscriptionId) {
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

const appResult = await bestEffort(`/v1/apps/${APP_ID}?fields[apps]=name,bundleId,primaryLocale,subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox`);
const results = [];

for (const target of SUBSCRIPTIONS) {
  const detailResult = await bestEffort(`/v1/subscriptions/${target.id}?fields[subscriptions]=name,productId,state,subscriptionPeriod,reviewNote,groupLevel`);
  const prices = await readPrices(target.id);
  const localizationResult = await bestEffort(`/v1/subscriptions/${target.id}/subscriptionLocalizations?fields[subscriptionLocalizations]=name,locale,description&limit=200`, { retries: 2 });
  const screenshotResult = await bestEffort(`/v1/subscriptions/${target.id}/appStoreReviewScreenshot?fields[subscriptionAppStoreReviewScreenshots]=fileSize,fileName,sourceFileChecksum,assetDeliveryState`, { allow404: true, retries: 2 });
  const detail = detailResult.payload?.data?.attributes || {};
  const localizations = (localizationResult.payload?.data || []).map((row) => ({ id: row.id, ...row.attributes }));
  const reviewScreenshot = screenshotResult.payload?.data ? { id: screenshotResult.payload.data.id, ...screenshotResult.payload.data.attributes } : null;

  results.push({
    id: target.id,
    productId: detail.productId || target.productId,
    state: detail.state || "UNKNOWN",
    period: detail.subscriptionPeriod || null,
    targetPrice: target.targetPrice,
    targetPricePresent: prices.some((row) => Math.abs(Number(row.customerPrice) - target.targetPrice) < 0.001),
    prices,
    localizations,
    localizationError: localizationResult.error,
    reviewScreenshot,
    reviewScreenshotError: screenshotResult.error,
    reviewNotePresent: Boolean(String(detail.reviewNote || "").trim()),
    detailError: detailResult.error,
  });
}

const appAttrs = appResult.payload?.data?.attributes || {};
const output = {
  app: {
    id: APP_ID,
    name: appAttrs.name || "TheTok",
    bundleId: appAttrs.bundleId || BUNDLE_ID,
    notificationProduction: appAttrs.subscriptionStatusUrl || null,
    notificationProductionVersion: appAttrs.subscriptionStatusUrlVersion || null,
    notificationSandbox: appAttrs.subscriptionStatusUrlForSandbox || null,
    notificationSandboxVersion: appAttrs.subscriptionStatusUrlVersionForSandbox || null,
    error: appResult.error,
  },
  group: { id: GROUP_ID, name: "Tok One" },
  subscriptions: results,
};

console.log(JSON.stringify(output, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "## Tok One — App Store readiness audit",
    "",
    `- App: ${output.app.name} (${output.app.id})`,
    `- Bundle: \`${output.app.bundleId}\``,
    `- Group: Tok One (${GROUP_ID})`,
    `- Notifications production: ${output.app.notificationProductionVersion || "unknown"}`,
    `- Notifications sandbox: ${output.app.notificationSandboxVersion || "unknown"}`,
    "",
    "| Product | State | Target | Target configured | Review screenshot | Localization |",
    "|---|---|---:|---|---|---|",
    ...results.map((row) => `| \`${row.productId}\` | ${row.state} | CHF ${row.targetPrice.toFixed(2)} | ${row.targetPricePresent ? "yes" : "no"} | ${row.reviewScreenshot ? "yes" : "no"} | ${row.localizations.map((loc) => loc.locale).join(", ") || (row.localizationError ? "API unavailable" : "none")} |`),
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, "utf8");
}
