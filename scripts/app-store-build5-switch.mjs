import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const APP_ID = "6799776439";
const VERSION_ID = "c4210449-0d31-465a-bb58-739fbf2cda92";
const BUILD4_ID = "a8e46850-3593-4ac3-8169-8e7a21fe3441";
const BUILD_NUMBER = "5";
const MONTHLY_ID = "6800165116";
const YEARLY_ID = "6800167330";

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
  const signature = sign("sha256", Buffer.from(input), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${signature.toString("base64url")}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function apiError(payload, status, context) {
  const detail = (payload?.errors || [])
    .map((item) => [item?.code, item?.title, item?.detail].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join(" | ");
  return `${context}: HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

async function request(method, pathname, { body, retries = 3 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
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
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (response.ok) return payload;
    lastError = new Error(apiError(payload, response.status, `${method} ${pathname}`));
    if (method !== "GET" || response.status < 500 || attempt === retries) throw lastError;
    await sleep(750 * (attempt + 1));
  }
  throw lastError || new Error(`${method} ${pathname} failed.`);
}

async function readVersion() {
  return request("GET", `/v1/appStoreVersions/${VERSION_ID}?include=build&fields[appStoreVersions]=versionString,platform,appVersionState,releaseType&fields[builds]=version,processingState,buildAudienceType,expired`);
}

function attachedBuild(versionPayload) {
  return (versionPayload?.included || []).find((row) => row.type === "builds") || null;
}

async function readBuild5() {
  const url = new URL("/v1/builds", API);
  url.searchParams.set("filter[app]", APP_ID);
  url.searchParams.set("filter[version]", BUILD_NUMBER);
  url.searchParams.set("fields[builds]", "version,uploadedDate,processingState,expired,usesNonExemptEncryption,buildAudienceType,minOsVersion");
  url.searchParams.set("limit", "20");
  return request("GET", `${url.pathname}${url.search}`);
}

async function waitForBuild5() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const payload = await readBuild5();
    const rows = payload?.data || [];
    const build = rows.find((row) => String(row.attributes?.version || "") === BUILD_NUMBER) || rows[0] || null;
    if (!build) {
      console.log(`BUILD5_POLL=${attempt} not-visible`);
      await sleep(10000);
      continue;
    }

    const state = String(build.attributes?.processingState || "UNKNOWN");
    const audience = String(build.attributes?.buildAudienceType || "UNKNOWN");
    console.log(`BUILD5_POLL=${attempt} id=${build.id} state=${state} audience=${audience}`);

    if (state === "VALID" && audience === "APP_STORE_ELIGIBLE" && build.attributes?.expired !== true) {
      return build;
    }
    if (["FAILED", "INVALID"].includes(state)) {
      throw new Error(`Build 5 processing failed with state ${state}.`);
    }
    await sleep(10000);
  }
  throw new Error("Build 5 did not become VALID / APP_STORE_ELIGIBLE within the audit window.");
}

async function readSubscription(id) {
  return request("GET", `/v1/subscriptions/${id}?fields[subscriptions]=name,productId,state,subscriptionPeriod,reviewNote,groupLevel`);
}

const build5 = await waitForBuild5();
const beforeVersion = await readVersion();
const beforeState = String(beforeVersion?.data?.attributes?.appVersionState || "UNKNOWN");
const beforeBuild = attachedBuild(beforeVersion);

if (beforeState !== "PREPARE_FOR_SUBMISSION" && beforeState !== "DEVELOPER_REJECTED") {
  throw new Error(`Refusing to modify App Store version in state ${beforeState}.`);
}
if (beforeBuild?.id && beforeBuild.id !== BUILD4_ID && beforeBuild.id !== build5.id) {
  throw new Error(`Refusing to replace unexpected attached build ${beforeBuild.id}.`);
}

if (beforeBuild?.id !== build5.id) {
  await request("PATCH", `/v1/appStoreVersions/${VERSION_ID}/relationships/build`, {
    body: { data: { type: "builds", id: build5.id } },
  });
  console.log(`Attached build 5 ${build5.id} to App Store version 1.0.`);
} else {
  console.log(`Build 5 ${build5.id} is already attached.`);
}

const afterVersion = await readVersion();
const afterBuild = attachedBuild(afterVersion);
if (afterBuild?.id !== build5.id) {
  throw new Error(`Build 5 attachment verification failed; attached=${afterBuild?.id || "none"}.`);
}

const monthly = await readSubscription(MONTHLY_ID);
const yearly = await readSubscription(YEARLY_ID);
const output = {
  versionId: VERSION_ID,
  versionState: afterVersion?.data?.attributes?.appVersionState || null,
  build5: { id: build5.id, ...build5.attributes },
  attachedBuild: afterBuild ? { id: afterBuild.id, ...afterBuild.attributes } : null,
  monthlySubscription: { id: monthly?.data?.id || MONTHLY_ID, ...monthly?.data?.attributes },
  yearlySubscription: { id: yearly?.data?.id || YEARLY_ID, ...yearly?.data?.attributes },
};

console.log("APP_STORE_BUILD5_SWITCH=" + JSON.stringify(output));
console.log(JSON.stringify(output, null, 2));
