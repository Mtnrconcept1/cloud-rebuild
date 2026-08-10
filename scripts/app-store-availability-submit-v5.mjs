import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const APP_ID = "6799776439";
const VERSION_ID = "c4210449-0d31-465a-bb58-739fbf2cda92";

function need(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizeKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  return `${normalized.trim()}\n`;
}

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function createToken() {
  const issuedAt = Math.floor(Date.now() / 1000) - 5;
  const header = { alg: "ES256", kid: need("APP_STORE_CONNECT_KEY_ID"), typ: "JWT" };
  const payload = {
    iss: need("APP_STORE_CONNECT_ISSUER_ID"),
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: "appstoreconnect-v1",
  };
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(input), {
    key: createPrivateKey(normalizeKey(need("APP_STORE_CONNECT_PRIVATE_KEY"))),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${signature.toString("base64url")}`;
}

const TOKEN = createToken();

function apiErrors(payload, status) {
  const rows = Array.isArray(payload?.errors) ? payload.errors : [];
  if (rows.length === 0) return [{ status: String(status), code: null, title: null, detail: null, source: null }];
  return rows.map((error) => ({
    status: error.status,
    code: error.code,
    title: error.title,
    detail: error.detail,
    source: error.source || null,
  }));
}

async function api(path, { method = "GET", body, optional404 = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  if (response.status !== 204) {
    try { payload = await response.json(); } catch { /* deterministic error below */ }
  }
  if (optional404 && response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(JSON.stringify(apiErrors(payload, response.status)));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function localTerritoryAvailabilityId(territoryId, index) {
  return `\${territory-${index}-${territoryId.toLowerCase()}}`;
}

async function ensureAvailability() {
  const current = await api(`/v1/apps/${APP_ID}/appAvailabilityV2?include=territoryAvailabilities&limit[territoryAvailabilities]=200`, { optional404: true });
  if (current?.data?.id) {
    console.log(`Availability already exists: ${current.data.id}.`);
    return current.data.id;
  }

  const territoryPayload = await api(`/v1/territories?limit=200`);
  const territories = Array.isArray(territoryPayload?.data) ? territoryPayload.data : [];
  if (territories.length < 100 || !territories.some((territory) => territory.id === "CHE")) {
    throw new Error(`Unexpected App Store territory catalog (${territories.length} territories, CHE present=${territories.some((territory) => territory.id === "CHE")}).`);
  }

  const localIds = new Map(
    territories.map((territory, index) => [territory.id, localTerritoryAvailabilityId(territory.id, index)]),
  );

  const links = territories.map((territory) => ({
    type: "territoryAvailabilities",
    id: localIds.get(territory.id),
  }));

  const included = territories.map((territory) => ({
    type: "territoryAvailabilities",
    id: localIds.get(territory.id),
    attributes: {
      available: territory.id === "CHE",
      preOrderEnabled: false,
    },
    relationships: {
      territory: {
        data: { type: "territories", id: territory.id },
      },
    },
  }));

  const created = await api(`/v2/appAvailabilities`, {
    method: "POST",
    body: {
      data: {
        type: "appAvailabilities",
        attributes: { availableInNewTerritories: false },
        relationships: {
          app: { data: { type: "apps", id: APP_ID } },
          territoryAvailabilities: { data: links },
        },
      },
      included,
    },
  });

  if (!created?.data?.id) throw new Error("Apple did not return an app availability id.");
  console.log(`Created App Store availability ${created.data.id} with Switzerland enabled and ${territories.length - 1} storefronts disabled.`);
  return created.data.id;
}

async function verifySwitzerlandOnly(availabilityId) {
  const first = await api(`/v2/appAvailabilities/${availabilityId}/territoryAvailabilities?include=territory&limit=200`);
  const rows = Array.isArray(first?.data) ? first.data : [];
  if (rows.length < 100) throw new Error(`Only ${rows.length} territory availability rows were returned.`);

  let enabled = [];
  for (const row of rows) {
    if (row.attributes?.available === true) {
      const territoryId = row.relationships?.territory?.data?.id || null;
      enabled.push(territoryId || row.id);
    }
  }
  enabled = [...new Set(enabled)].sort();
  if (enabled.length !== 1 || enabled[0] !== "CHE") {
    throw new Error(`Unexpected enabled territories: ${JSON.stringify(enabled)}.`);
  }
  console.log("Verified App Store availability: Switzerland only.");
}

async function getOrCreateReadySubmission() {
  const payload = await api(`/v1/apps/${APP_ID}/reviewSubmissions?limit=50`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const active = rows.find((row) => ["READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"].includes(row.attributes?.state));
  if (active) return active;

  const created = await api(`/v1/reviewSubmissions`, {
    method: "POST",
    body: {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: APP_ID } } },
      },
    },
  });
  if (!created?.data?.id) throw new Error("Apple did not create a review submission.");
  return created.data;
}

async function addVersionToSubmission(submission) {
  const items = await api(`/v1/reviewSubmissions/${submission.id}/items?limit=200`);
  const existing = (items.data || []).find((item) => item.relationships?.appStoreVersion?.data?.id === VERSION_ID);
  if (existing) {
    console.log(`App Store version is already in review submission as item ${existing.id}.`);
    return existing;
  }

  try {
    const created = await api(`/v1/reviewSubmissionItems`, {
      method: "POST",
      body: {
        data: {
          type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
            appStoreVersion: { data: { type: "appStoreVersions", id: VERSION_ID } },
          },
        },
      },
    });
    console.log(`App Store version added to review submission as item ${created.data?.id}.`);
    return created.data;
  } catch (error) {
    console.error(`REVIEW_ITEM_CREATE_ERRORS=${JSON.stringify(apiErrors(error.payload, error.status))}`);
    throw error;
  }
}

async function submit(submission) {
  if (["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(submission.attributes?.state)) {
    console.log(`Submission already ${submission.attributes.state}.`);
    return submission;
  }

  try {
    const updated = await api(`/v1/reviewSubmissions/${submission.id}`, {
      method: "PATCH",
      body: {
        data: {
          type: "reviewSubmissions",
          id: submission.id,
          attributes: { submitted: true },
        },
      },
    });
    console.log(`Review submission accepted; state=${updated.data?.attributes?.state || "unknown"}.`);
    return updated.data;
  } catch (error) {
    console.error(`REVIEW_SUBMIT_ERRORS=${JSON.stringify(apiErrors(error.payload, error.status))}`);
    throw error;
  }
}

async function finalState(submissionId) {
  const version = await api(`/v1/appStoreVersions/${VERSION_ID}`);
  const submission = await api(`/v1/reviewSubmissions/${submissionId}?include=appStoreVersionForReview,items`);
  console.log(`FINAL_VERSION_STATE=${version.data?.attributes?.appStoreState || version.data?.attributes?.appVersionState || "unknown"}`);
  console.log(`FINAL_REVIEW_STATE=${submission.data?.attributes?.state || "unknown"}`);
  console.log(`FINAL_REVIEW_VERSION=${submission.data?.relationships?.appStoreVersionForReview?.data?.id || "none"}`);
  console.log(`FINAL_REVIEW_ITEM_COUNT=${submission.data?.relationships?.items?.meta?.paging?.total ?? 0}`);
}

async function main() {
  const availabilityId = await ensureAvailability();
  await verifySwitzerlandOnly(availabilityId);

  const submission = await getOrCreateReadySubmission();
  console.log(`Using review submission ${submission.id} (${submission.attributes?.state}).`);
  await addVersionToSubmission(submission);
  await submit(submission);
  await finalState(submission.id);
  console.log("APP_STORE_V6_COMPLETE");
}

main().catch((error) => {
  console.error(`App Store v6 failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
