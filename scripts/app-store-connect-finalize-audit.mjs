import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const AUD = "appstoreconnect-v1";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePrivateKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  return `${normalized.trim()}\n`;
}

function b64(value) { return Buffer.from(value).toString("base64url"); }

function token() {
  const issuerId = requireEnv("APP_STORE_CONNECT_ISSUER_ID");
  const keyId = requireEnv("APP_STORE_CONNECT_KEY_ID");
  const privateKey = normalizePrivateKey(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY"));
  const iat = Math.floor(Date.now() / 1000) - 5;
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: issuerId, iat, exp: iat + 300, aud: AUD };
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(input), { key: createPrivateKey(privateKey), dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

const authToken = token();

async function request(path, { optional404 = false } = {}) {
  const response = await fetch(`${API}${path}`, { headers: { Accept: "application/json", Authorization: `Bearer ${authToken}` } });
  let payload = null;
  try { payload = await response.json(); } catch { /* deterministic error below */ }
  if (optional404 && response.status === 404) return null;
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || `HTTP ${response.status}`;
    throw new Error(`${path}: ${detail}`);
  }
  return payload;
}

function one(data, label) {
  const rows = Array.isArray(data?.data) ? data.data : [];
  if (rows.length !== 1) throw new Error(`${label}: expected 1 result, got ${rows.length}.`);
  return rows[0];
}
function attrs(resource) { return resource?.attributes || {}; }
function redactReview(attributes = {}) {
  const copy = { ...attributes };
  if (copy.demoAccountPassword) copy.demoAccountPassword = "<configured>";
  return copy;
}

const bundleId = process.env.IOS_BUNDLE_ID?.trim() || "ch.thetok.app";
const versionString = process.env.APP_STORE_VERSION?.trim() || "1.0";
const locale = process.env.APP_STORE_LOCALE?.trim() || "fr-FR";

const app = one(await request(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=2`), "app");
console.log("APP", JSON.stringify({ id: app.id, ...attrs(app) }));
const version = one(await request(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${encodeURIComponent(versionString)}&limit=2`), "version");
console.log("VERSION", JSON.stringify({ id: version.id, ...attrs(version) }));

const versionLocs = await request(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`);
const versionLoc = versionLocs.data.find((row) => row.attributes?.locale === locale) || null;
console.log("VERSION_LOCALIZATION", JSON.stringify(versionLoc ? { id: versionLoc.id, ...attrs(versionLoc) } : null));

const buildRelationship = await request(`/v1/appStoreVersions/${version.id}/relationships/build`, { optional404: true });
const buildId = buildRelationship?.data?.id || null;
let build = null;
if (buildId) build = await request(`/v1/builds/${buildId}`);
console.log("SELECTED_BUILD", JSON.stringify(build?.data ? { id: build.data.id, ...attrs(build.data) } : null));
const candidateBuilds = await request(`/v1/builds?filter[app]=${app.id}&filter[version]=2&include=preReleaseVersion&limit=20`);
console.log("BUILD_2_CANDIDATES", JSON.stringify((candidateBuilds.data || []).map((row) => ({ id: row.id, ...attrs(row), preReleaseVersionId: row.relationships?.preReleaseVersion?.data?.id || null }))));
console.log("BUILD_2_INCLUDED", JSON.stringify((candidateBuilds.included || []).map((row) => ({ type: row.type, id: row.id, ...attrs(row) }))));

const review = await request(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`, { optional404: true });
console.log("REVIEW_DETAIL", JSON.stringify(review?.data ? { id: review.data.id, ...redactReview(attrs(review.data)) } : null));

const infos = await request(`/v1/apps/${app.id}/appInfos?include=appInfoLocalizations,primaryCategory,secondaryCategory,ageRatingDeclaration&limit=20&limit[appInfoLocalizations]=50`);
const appInfo = infos.data.find((row) => row.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION") || infos.data[0];
if (!appInfo) throw new Error("No AppInfo found.");
const includedById = new Map((infos.included || []).map((row) => [row.id, row]));
const relId = (name) => appInfo.relationships?.[name]?.data?.id || null;
const primary = includedById.get(relId("primaryCategory"));
const secondary = includedById.get(relId("secondaryCategory"));
const age = includedById.get(relId("ageRatingDeclaration"));
const appInfoLocs = (infos.included || []).filter((row) => row.type === "appInfoLocalizations");
const appInfoLoc = appInfoLocs.find((row) => row.attributes?.locale === locale) || appInfoLocs[0] || null;
console.log("APP_INFO", JSON.stringify({ id: appInfo.id, ...attrs(appInfo) }));
console.log("APP_INFO_LOCALIZATION", JSON.stringify(appInfoLoc ? { id: appInfoLoc.id, ...attrs(appInfoLoc) } : null));
console.log("CATEGORIES", JSON.stringify({ primary: primary ? { id: primary.id, ...attrs(primary) } : null, secondary: secondary ? { id: secondary.id, ...attrs(secondary) } : null }));
console.log("AGE_RATING", JSON.stringify(age ? { id: age.id, ...attrs(age) } : null));

const price = await request(`/v1/apps/${app.id}/appPriceSchedule?include=baseTerritory,manualPrices,automaticPrices&limit[manualPrices]=50&limit[automaticPrices]=50`, { optional404: true });
console.log("PRICE_SCHEDULE", JSON.stringify(price?.data ? { id: price.data.id, ...attrs(price.data), relationships: price.data.relationships, included: (price.included || []).map((row) => ({ type: row.type, id: row.id, ...attrs(row), relationships: row.relationships })) } : null));
if (price?.data?.id) {
  const manual = await request(`/v1/appPriceSchedules/${price.data.id}/manualPrices?include=appPricePoint,territory&limit=50`);
  console.log("MANUAL_PRICES", JSON.stringify({ data: (manual.data || []).map((row) => ({ id: row.id, ...attrs(row), relationships: row.relationships })), included: (manual.included || []).map((row) => ({ type: row.type, id: row.id, ...attrs(row) })) }));
}

const availability = await request(`/v1/apps/${app.id}/appAvailabilityV2`, { optional404: true });
console.log("AVAILABILITY", JSON.stringify(availability?.data ? { id: availability.data.id, ...attrs(availability.data) } : null));
const submissions = await request(`/v1/apps/${app.id}/reviewSubmissions?limit=20`);
console.log("REVIEW_SUBMISSIONS", JSON.stringify((submissions.data || []).map((row) => ({ id: row.id, ...attrs(row) }))));
console.log("AUDIT_COMPLETE");
