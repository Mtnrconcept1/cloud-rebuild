import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const APP_ID = "6799776439";
const VERSION_ID = "c4210449-0d31-465a-bb58-739fbf2cda92";
const SUBMISSION_ID = "d7f7e655-2585-4b90-b203-31d0a18fadd7";

const need = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const b64 = (value) => Buffer.from(value).toString("base64url");
const rawKey = need("APP_STORE_CONNECT_PRIVATE_KEY");
const privateKey = `${(rawKey.includes("\\n") && !rawKey.includes("\n") ? rawKey.replaceAll("\\n", "\n") : rawKey).trim()}\n`;
const iat = Math.floor(Date.now() / 1000) - 5;
const header = { alg: "ES256", kid: need("APP_STORE_CONNECT_KEY_ID"), typ: "JWT" };
const payload = { iss: need("APP_STORE_CONNECT_ISSUER_ID"), iat, exp: iat + 300, aud: "appstoreconnect-v1" };
const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
const signature = sign("sha256", Buffer.from(input), {
  key: createPrivateKey(privateKey),
  dsaEncoding: "ieee-p1363",
});
const token = `${input}.${signature.toString("base64url")}`;

async function read(path, optional404 = false) {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (optional404 && response.status === 404) return null;
  if (!response.ok) throw new Error(JSON.stringify(body?.errors || [{ status: response.status }]));
  return body;
}

const version = await read(`/v1/appStoreVersions/${VERSION_ID}?include=build,appStoreReviewDetail,appStoreVersionSubmission`);
console.log("VERSION_STATE", JSON.stringify({
  attributes: version.data?.attributes,
  relationships: version.data?.relationships,
  included: version.included,
}));

const submission = await read(`/v1/reviewSubmissions/${SUBMISSION_ID}?include=appStoreVersionForReview,items`, true);
console.log("REVIEW_SUBMISSION", JSON.stringify(submission));

const availability = await read(`/v1/apps/${APP_ID}/appAvailabilityV2?include=territoryAvailabilities&limit[territoryAvailabilities]=50`, true);
console.log("AVAILABILITY", JSON.stringify(availability));

console.log("REVIEWABILITY_AUDIT_COMPLETE");
