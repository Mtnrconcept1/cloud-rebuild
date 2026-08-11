import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const APP_ID = "6799776439";
const VERSION_ID = "c4210449-0d31-465a-bb58-739fbf2cda92";
const VERSION_STRING = "1.0";
const BUILD_NUMBER = "4";
const MONTHLY_SUBSCRIPTION_ID = "6800165116";

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

async function api(pathname, { allow404 = false, retries = 3 } = {}) {
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

async function readBuilds() {
  const url = new URL("/v1/builds", API);
  url.searchParams.set("filter[app]", APP_ID);
  url.searchParams.set("filter[version]", BUILD_NUMBER);
  url.searchParams.set("fields[builds]", "version,uploadedDate,processingState,expired,usesNonExemptEncryption,buildAudienceType,minOsVersion");
  url.searchParams.set("limit", "20");
  return api(`${url.pathname}${url.search}`);
}

async function waitForBuild4() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const builds = await readBuilds();
    const rows = builds?.data || [];
    const build = rows.find((row) => String(row.attributes?.version || "") === BUILD_NUMBER) || rows[0] || null;
    if (build) {
      const state = String(build.attributes?.processingState || "UNKNOWN");
      const audience = String(build.attributes?.buildAudienceType || "UNKNOWN");
      console.log(`BUILD4_ATTEMPT=${attempt} id=${build.id} state=${state} audience=${audience}`);
      if (state === "VALID" && audience === "APP_STORE_ELIGIBLE") return build;
      if (["FAILED", "INVALID"].includes(state)) throw new Error(`Build 4 processing failed with state ${state}.`);
    } else {
      console.log(`BUILD4_ATTEMPT=${attempt} not-visible-yet`);
    }
    await sleep(10000);
  }
  throw new Error("Build 4 did not become VALID / APP_STORE_ELIGIBLE within the audit window.");
}

async function readVersion() {
  return api(`/v1/appStoreVersions/${VERSION_ID}?include=build&fields[appStoreVersions]=versionString,platform,appVersionState,releaseType,createdDate&fields[builds]=version,processingState,buildAudienceType`);
}

async function readSubmissions() {
  const payload = await api(`/v1/apps/${APP_ID}/reviewSubmissions?limit=50`);
  const rows = payload?.data || [];
  const details = [];
  for (const row of rows) {
    const state = row.attributes?.state || "UNKNOWN";
    if (!["READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES"].includes(state)) continue;
    const items = await api(`/v1/reviewSubmissions/${row.id}/items?limit=200`);
    details.push({
      id: row.id,
      state,
      submittedDate: row.attributes?.submittedDate || null,
      items: (items?.data || []).map((item) => ({
        id: item.id,
        state: item.attributes?.state || null,
        appStoreVersionId: item.relationships?.appStoreVersion?.data?.id || null,
        subscriptionId: item.relationships?.subscription?.data?.id || null,
        inAppPurchaseId: item.relationships?.inAppPurchaseV2?.data?.id || null,
      })),
    });
  }
  return details;
}

const build = await waitForBuild4();
const versionPayload = await readVersion();
const version = versionPayload?.data;
const attachedBuild = (versionPayload?.included || []).find((row) => row.type === "builds") || null;
const monthly = await api(`/v1/subscriptions/${MONTHLY_SUBSCRIPTION_ID}?fields[subscriptions]=name,productId,state,subscriptionPeriod,reviewNote,groupLevel`);
const submissions = await readSubmissions();

const output = {
  build4: { id: build.id, ...build.attributes },
  version: {
    id: version?.id || VERSION_ID,
    expectedVersionString: VERSION_STRING,
    ...version?.attributes,
    attachedBuild: attachedBuild ? { id: attachedBuild.id, ...attachedBuild.attributes } : null,
  },
  monthlySubscription: { id: monthly?.data?.id || MONTHLY_SUBSCRIPTION_ID, ...monthly?.data?.attributes },
  activeReviewSubmissions: submissions,
};

console.log("APP_STORE_BUILD4_AUDIT=" + JSON.stringify(output));
console.log(JSON.stringify(output, null, 2));
