import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const APP_ID = "6799776439";
const VERSION_ID = "c4210449-0d31-465a-bb58-739fbf2cda92";
const BUILD2_ID = "20ad0b5b-4f4c-42ba-bf32-12db1aea2154";
const BUILD4_ID = "a8e46850-3593-4ac3-8169-8e7a21fe3441";
const REVIEW_SUBMISSION_ID = "d7f7e655-2585-4b90-b203-31d0a18fadd7";
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

function formatError(payload, status, context) {
  const detail = (payload?.errors || []).map((item) => [item?.code, item?.title, item?.detail].filter(Boolean).join(" — ")).filter(Boolean).join(" | ");
  return `${context}: HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

async function request(method, pathname, { body, retries = 2 } = {}) {
  let last = null;
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
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    if (response.ok) return payload;
    last = new Error(formatError(payload, response.status, `${method} ${pathname}`));
    if (response.status < 500 || method !== "GET" || attempt === retries) throw last;
    await sleep(500 * (attempt + 1));
  }
  throw last;
}

async function readReviewSubmission() {
  return request("GET", `/v1/reviewSubmissions/${REVIEW_SUBMISSION_ID}?fields[reviewSubmissions]=state,submittedDate,platform`);
}

async function readVersion() {
  return request("GET", `/v1/appStoreVersions/${VERSION_ID}?include=build&fields[appStoreVersions]=versionString,platform,appVersionState,releaseType&fields[builds]=version,processingState,buildAudienceType`);
}

async function readMonthly() {
  return request("GET", `/v1/subscriptions/${MONTHLY_SUBSCRIPTION_ID}?fields[subscriptions]=name,productId,state,subscriptionPeriod,reviewNote,groupLevel`);
}

async function readBuild4() {
  return request("GET", `/v1/builds/${BUILD4_ID}?fields[builds]=version,processingState,buildAudienceType,expired`);
}

function attachedBuildId(versionPayload) {
  return (versionPayload?.included || []).find((row) => row.type === "builds")?.id || null;
}

const beforeSubmission = await readReviewSubmission();
const beforeSubmissionState = beforeSubmission?.data?.attributes?.state || "UNKNOWN";
const beforeVersion = await readVersion();
const beforeVersionState = beforeVersion?.data?.attributes?.appVersionState || "UNKNOWN";
const beforeBuildId = attachedBuildId(beforeVersion);
const build4 = await readBuild4();
const build4Attrs = build4?.data?.attributes || {};

console.log(`PRECONDITION submission=${beforeSubmissionState} version=${beforeVersionState} attached=${beforeBuildId} build4=${build4Attrs.processingState}/${build4Attrs.buildAudienceType}`);

if (beforeSubmissionState !== "WAITING_FOR_REVIEW") {
  throw new Error(`Refusing to cancel unexpected review submission state ${beforeSubmissionState}.`);
}
if (beforeVersionState !== "WAITING_FOR_REVIEW") {
  throw new Error(`Refusing to switch unexpected app version state ${beforeVersionState}.`);
}
if (beforeBuildId !== BUILD2_ID) {
  throw new Error(`Refusing to replace unexpected attached build ${beforeBuildId || "none"}; expected build 2 ${BUILD2_ID}.`);
}
if (String(build4Attrs.version) !== "4" || build4Attrs.processingState !== "VALID" || build4Attrs.buildAudienceType !== "APP_STORE_ELIGIBLE" || build4Attrs.expired === true) {
  throw new Error("Build 4 is not a valid App Store eligible replacement.");
}

await request("PATCH", `/v1/reviewSubmissions/${REVIEW_SUBMISSION_ID}`, {
  body: {
    data: {
      type: "reviewSubmissions",
      id: REVIEW_SUBMISSION_ID,
      attributes: { canceled: true },
    },
  },
});
console.log(`Canceled review submission ${REVIEW_SUBMISSION_ID}.`);

let editableVersion = null;
let finalSubmission = null;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  finalSubmission = await readReviewSubmission();
  editableVersion = await readVersion();
  const submissionState = finalSubmission?.data?.attributes?.state || "UNKNOWN";
  const versionState = editableVersion?.data?.attributes?.appVersionState || "UNKNOWN";
  console.log(`CANCEL_POLL=${attempt} submission=${submissionState} version=${versionState}`);
  if (versionState === "DEVELOPER_REJECTED") break;
  if (attempt === 30) throw new Error(`Version did not become DEVELOPER_REJECTED after cancel; current=${versionState}.`);
  await sleep(2000);
}

await request("PATCH", `/v1/appStoreVersions/${VERSION_ID}/relationships/build`, {
  body: { data: { type: "builds", id: BUILD4_ID } },
});
console.log(`Attached build 4 ${BUILD4_ID} to App Store version 1.0.`);

const afterVersion = await readVersion();
const afterBuildId = attachedBuildId(afterVersion);
if (afterBuildId !== BUILD4_ID) {
  throw new Error(`App Store version still points to ${afterBuildId || "no build"} after build 4 attachment.`);
}

const monthly = await readMonthly();
const output = {
  appId: APP_ID,
  versionId: VERSION_ID,
  versionState: afterVersion?.data?.attributes?.appVersionState || null,
  attachedBuildId: afterBuildId,
  attachedBuildNumber: (afterVersion?.included || []).find((row) => row.id === BUILD4_ID)?.attributes?.version || null,
  canceledReviewSubmissionId: REVIEW_SUBMISSION_ID,
  canceledReviewSubmissionState: finalSubmission?.data?.attributes?.state || null,
  monthlySubscription: { id: monthly?.data?.id || MONTHLY_SUBSCRIPTION_ID, ...monthly?.data?.attributes },
};
console.log("APP_STORE_BUILD4_SWITCH=" + JSON.stringify(output));
console.log(JSON.stringify(output, null, 2));
