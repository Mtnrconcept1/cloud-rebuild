import { createHash, createPrivateKey, sign } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const DEFAULT_BUNDLE_ID = "ch.thetok.app";
const DEFAULT_VERSION = "1.0";
const DEFAULT_LOCALE = "fr-FR";

const TARGETS = [
  {
    label: 'iPhone 6.9"',
    displayType: "APP_IPHONE_67",
    directory: "iPhone_6.9_1320x2868",
    width: 1320,
    height: 2868,
  },
  {
    label: 'iPad 13"',
    displayType: "APP_IPAD_PRO_3GEN_129",
    directory: "iPad_13_2752x2064",
    width: 2752,
    height: 2064,
  },
];

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
    throw new Error("APP_STORE_CONNECT_PRIVATE_KEY is not a valid .p8 private key payload.");
  }
  return `${trimmed}\n`;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

const credentials = {
  issuerId: requireEnv("APP_STORE_CONNECT_ISSUER_ID"),
  keyId: requireEnv("APP_STORE_CONNECT_KEY_ID"),
  privateKey: normalizePrivateKey(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY")),
};

function createToken() {
  const issuedAt = Math.floor(Date.now() / 1000) - 5;
  const expiresAt = issuedAt + 5 * 60;
  const header = { alg: "ES256", kid: credentials.keyId, typ: "JWT" };
  const payload = { iss: credentials.issuerId, iat: issuedAt, exp: expiresAt, aud: AUDIENCE };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(credentials.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function apiErrorMessage(payload, status, context) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const detail = errors
    .map((error) => [error?.code, error?.title, error?.detail].filter(Boolean).join(": "))
    .filter(Boolean)
    .join(" | ");
  return `${context} failed with HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

async function apiRequest(method, pathname, { body, context = `${method} ${pathname}` } = {}) {
  const response = await fetch(new URL(pathname, API), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${createToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }
  if (!response.ok) throw new Error(apiErrorMessage(payload, response.status, context));
  return payload;
}

function getJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Expected a JPEG file.");
  }
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (sofMarkers.has(marker)) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return { width, height };
    }
    offset += segmentLength;
  }
  throw new Error("Unable to read JPEG dimensions.");
}

async function validateTargetAssets(root, target) {
  const dir = path.join(root, target.directory);
  const names = (await readdir(dir))
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (names.length < 1 || names.length > 10) {
    throw new Error(`${target.label}: expected 1-10 JPEG screenshots, found ${names.length}.`);
  }

  const files = [];
  for (const name of names) {
    const filePath = path.join(dir, name);
    const buffer = await readFile(filePath);
    const dimensions = getJpegDimensions(buffer);
    if (dimensions.width !== target.width || dimensions.height !== target.height) {
      throw new Error(
        `${target.label}: ${name} is ${dimensions.width}x${dimensions.height}; expected ${target.width}x${target.height}.`,
      );
    }
    const fileStat = await stat(filePath);
    if (fileStat.size <= 0) throw new Error(`${target.label}: ${name} is empty.`);
    files.push({ name, filePath, size: fileStat.size, buffer });
  }
  console.log(`${target.label}: validated ${files.length} screenshot(s) at ${target.width}x${target.height}.`);
  return files;
}

async function resolveApp(bundleId) {
  const url = new URL("/v1/apps", API);
  url.searchParams.set("filter[bundleId]", bundleId);
  url.searchParams.set("limit", "2");
  const payload = await apiRequest("GET", `${url.pathname}${url.search}`, { context: `Resolve app ${bundleId}` });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (rows.length !== 1) throw new Error(`Expected one App Store app for ${bundleId}, found ${rows.length}.`);
  return rows[0];
}

async function resolveVersion(appId, versionString) {
  const url = new URL(`/v1/apps/${appId}/appStoreVersions`, API);
  url.searchParams.set("filter[platform]", "IOS");
  url.searchParams.set("limit", "200");
  url.searchParams.set("fields[appStoreVersions]", "platform,versionString,appStoreState");
  const payload = await apiRequest("GET", `${url.pathname}${url.search}`, { context: `Resolve iOS version ${versionString}` });
  const rows = (Array.isArray(payload?.data) ? payload.data : [])
    .filter((row) => row?.attributes?.versionString === versionString);
  if (rows.length !== 1) {
    throw new Error(`Expected one iOS App Store version ${versionString}, found ${rows.length}.`);
  }
  const state = rows[0]?.attributes?.appStoreState || "unknown";
  const writableStates = new Set([
    "PREPARE_FOR_SUBMISSION",
    "READY_FOR_REVIEW",
    "INVALID_BINARY",
    "REJECTED",
    "METADATA_REJECTED",
    "DEVELOPER_REJECTED",
  ]);
  if (!writableStates.has(state)) {
    throw new Error(`App Store version ${versionString} is in state ${state}; refusing screenshot mutation.`);
  }
  console.log(`Resolved App Store version ${versionString} (${state}).`);
  return rows[0];
}

async function resolveLocalization(versionId, requestedLocale) {
  const url = new URL(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`, API);
  url.searchParams.set("limit", "200");
  url.searchParams.set("fields[appStoreVersionLocalizations]", "locale");
  const payload = await apiRequest("GET", `${url.pathname}${url.search}`, { context: "Resolve App Store localization" });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  let row = rows.find((item) => item?.attributes?.locale === requestedLocale);
  if (!row && requestedLocale.toLowerCase().startsWith("fr")) {
    row = rows.find((item) => String(item?.attributes?.locale || "").toLowerCase().startsWith("fr"));
  }
  if (!row) {
    throw new Error(`No French App Store version localization exists. Available locales: ${rows.map((item) => item?.attributes?.locale).filter(Boolean).join(", ") || "none"}.`);
  }
  console.log(`Resolved localization ${row.attributes.locale}.`);
  return row;
}

async function listScreenshotSets(localizationId) {
  const url = new URL(`/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`, API);
  url.searchParams.set("limit", "200");
  url.searchParams.set("fields[appScreenshotSets]", "screenshotDisplayType");
  const payload = await apiRequest("GET", `${url.pathname}${url.search}`, { context: "List screenshot sets" });
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function ensureScreenshotSet(localizationId, target, currentSets) {
  const existing = currentSets.find((set) => set?.attributes?.screenshotDisplayType === target.displayType);
  if (existing) {
    console.log(`${target.label}: using existing screenshot set ${existing.id}.`);
    return existing;
  }
  const payload = await apiRequest("POST", "/v1/appScreenshotSets", {
    context: `Create ${target.label} screenshot set`,
    body: {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: target.displayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: localizationId },
          },
        },
      },
    },
  });
  console.log(`${target.label}: created screenshot set ${payload.data.id}.`);
  return payload.data;
}

async function listScreenshots(setId) {
  const url = new URL(`/v1/appScreenshotSets/${setId}/appScreenshots`, API);
  url.searchParams.set("limit", "200");
  url.searchParams.set("fields[appScreenshots]", "fileName,assetDeliveryState");
  const payload = await apiRequest("GET", `${url.pathname}${url.search}`, { context: `List screenshots for set ${setId}` });
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function deleteExistingScreenshots(setId, targetLabel) {
  const existing = await listScreenshots(setId);
  if (existing.length === 0) {
    console.log(`${targetLabel}: screenshot set is empty.`);
    return;
  }
  console.log(`${targetLabel}: replacing ${existing.length} existing screenshot(s).`);
  for (const screenshot of existing) {
    await apiRequest("DELETE", `/v1/appScreenshots/${screenshot.id}`, {
      context: `Delete existing ${targetLabel} screenshot ${screenshot.id}`,
    });
  }
}

async function uploadBinaryOperations(buffer, operations, label) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error(`${label}: App Store Connect returned no upload operations.`);
  }
  for (const operation of operations) {
    const offset = Number(operation?.offset);
    const length = Number(operation?.length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > buffer.length) {
      throw new Error(`${label}: invalid upload operation range.`);
    }
    const headers = Object.fromEntries(
      (Array.isArray(operation.requestHeaders) ? operation.requestHeaders : [])
        .filter((header) => header?.name && header?.value)
        .map((header) => [header.name, header.value]),
    );
    const response = await fetch(operation.url, {
      method: operation.method || "PUT",
      headers,
      body: buffer.subarray(offset, offset + length),
    });
    if (!response.ok) {
      throw new Error(`${label}: binary upload part failed with HTTP ${response.status}.`);
    }
  }
}

async function reserveUploadCommit(setId, file, targetLabel) {
  const reservation = await apiRequest("POST", "/v1/appScreenshots", {
    context: `Reserve ${targetLabel} screenshot ${file.name}`,
    body: {
      data: {
        type: "appScreenshots",
        attributes: { fileSize: file.size, fileName: file.name },
        relationships: {
          appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } },
        },
      },
    },
  });
  const screenshot = reservation?.data;
  if (!screenshot?.id) throw new Error(`${targetLabel}: reservation did not return a screenshot id for ${file.name}.`);

  try {
    await uploadBinaryOperations(file.buffer, screenshot.attributes?.uploadOperations, `${targetLabel}/${file.name}`);
    const checksum = createHash("md5").update(file.buffer).digest("hex");
    await apiRequest("PATCH", `/v1/appScreenshots/${screenshot.id}`, {
      context: `Commit ${targetLabel} screenshot ${file.name}`,
      body: {
        data: {
          type: "appScreenshots",
          id: screenshot.id,
          attributes: { uploaded: true, sourceFileChecksum: checksum },
        },
      },
    });
    console.log(`${targetLabel}: uploaded ${file.name}.`);
    return { id: screenshot.id, name: file.name };
  } catch (error) {
    await apiRequest("DELETE", `/v1/appScreenshots/${screenshot.id}`, {
      context: `Cleanup failed reservation ${screenshot.id}`,
    }).catch(() => undefined);
    throw error;
  }
}

async function waitUntilComplete(item, targetLabel) {
  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    const url = new URL(`/v1/appScreenshots/${item.id}`, API);
    url.searchParams.set("fields[appScreenshots]", "fileName,assetDeliveryState");
    const payload = await apiRequest("GET", `${url.pathname}${url.search}`, {
      context: `Check ${targetLabel} screenshot ${item.name}`,
    });
    const state = payload?.data?.attributes?.assetDeliveryState;
    const stateName = typeof state === "string" ? state : state?.state;
    if (stateName === "COMPLETE") return;
    if (stateName === "FAILED") {
      const errors = Array.isArray(state?.errors) ? state.errors : [];
      const detail = errors.map((error) => error?.description || error?.message || error?.code).filter(Boolean).join(" | ");
      throw new Error(`${targetLabel}/${item.name}: Apple processing failed${detail ? `: ${detail}` : ""}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error(`${targetLabel}/${item.name}: timed out waiting for App Store processing.`);
}

async function reorderScreenshots(setId, uploaded, targetLabel) {
  await apiRequest("PATCH", `/v1/appScreenshotSets/${setId}/relationships/appScreenshots`, {
    context: `Order ${targetLabel} screenshots`,
    body: {
      data: uploaded.map((item) => ({ type: "appScreenshots", id: item.id })),
    },
  });
}

async function main() {
  const root = path.resolve(requireEnv("APP_STORE_SCREENSHOT_ASSET_ROOT"));
  const bundleId = process.env.IOS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;
  const versionString = process.env.APP_STORE_VERSION?.trim() || DEFAULT_VERSION;
  const locale = process.env.APP_STORE_LOCALE?.trim() || DEFAULT_LOCALE;

  const assets = new Map();
  for (const target of TARGETS) assets.set(target.displayType, await validateTargetAssets(root, target));

  const app = await resolveApp(bundleId);
  console.log(`Resolved App Store app ${app.attributes?.name || "TheTok"} (${app.id}).`);
  const version = await resolveVersion(app.id, versionString);
  const localization = await resolveLocalization(version.id, locale);
  const currentSets = await listScreenshotSets(localization.id);

  for (const target of TARGETS) {
    const files = assets.get(target.displayType);
    const set = await ensureScreenshotSet(localization.id, target, currentSets);
    await deleteExistingScreenshots(set.id, target.label);

    const uploaded = [];
    for (const file of files) uploaded.push(await reserveUploadCommit(set.id, file, target.label));
    for (const item of uploaded) await waitUntilComplete(item, target.label);
    await reorderScreenshots(set.id, uploaded, target.label);

    const finalRows = await listScreenshots(set.id);
    if (finalRows.length !== files.length) {
      throw new Error(`${target.label}: App Store contains ${finalRows.length} screenshots after upload; expected ${files.length}.`);
    }
    console.log(`${target.label}: ${finalRows.length} screenshot(s) COMPLETE and ordered.`);
  }

  console.log(`App Store screenshots uploaded successfully for ${bundleId} iOS ${versionString} (${localization.attributes.locale}).`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`App Store screenshot upload failed: ${message}`);
  process.exit(1);
});
