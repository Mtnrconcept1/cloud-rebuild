import { createPrivateKey, sign } from "node:crypto";
import { appendFile } from "node:fs/promises";

const APP_STORE_CONNECT_API = "https://api.appstoreconnect.apple.com";
const APP_STORE_CONNECT_AUDIENCE = "appstoreconnect-v1";
const DEFAULT_BUNDLE_ID = "ch.thetok.app";
const DEFAULT_TERRITORY = "CHE";
const DEFAULT_NOTIFICATION_URL = "https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/apple-storekit-webhook";
const GROUP_REFERENCE_NAME = "Tok One";

const PRODUCTS = [
  {
    key: "monthly",
    productId: "ch.thetok.app.tokone.monthly",
    internalName: "Tok One Monthly",
    subscriptionPeriod: "ONE_MONTH",
    customerPrice: 14.9,
    localizedName: "Tok One mensuel",
    localizedDescription: "Avantages Tok One, renouvelés chaque mois.",
  },
  {
    key: "yearly",
    productId: "ch.thetok.app.tokone.yearly",
    internalName: "Tok One Yearly",
    subscriptionPeriod: "ONE_YEAR",
    customerPrice: 149,
    localizedName: "Tok One annuel",
    localizedDescription: "Avantages Tok One pendant un an.",
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

function createToken({ issuerId, keyId, privateKey }) {
  const issuedAt = Math.floor(Date.now() / 1000) - 5;
  const expiresAt = issuedAt + 5 * 60;
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: issuerId, iat: issuedAt, exp: expiresAt, aud: APP_STORE_CONNECT_AUDIENCE };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = createPrivateKey(privateKey);
  const signature = sign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function formatAppleError(payload, status, context) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const detail = errors
    .map((error) => [error?.code, error?.title, error?.detail].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join(" | ");
  return `${context}: App Store Connect HTTP ${status}${detail ? `: ${detail}` : ""}`;
}

async function writeGithubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${name}=${String(value ?? "").replaceAll("\n", " ")}\n`,
    "utf8",
  );
}

function apiClient(credentials) {
  return async function api(pathOrUrl, options = {}) {
    const token = createToken(credentials);
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : new URL(pathOrUrl, APP_STORE_CONNECT_API).toString();
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    let payload = null;
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      throw new Error(formatAppleError(payload, response.status, `${options.method || "GET"} ${url}`));
    }
    return payload;
  };
}

async function findApp(api, bundleId) {
  const url = new URL("/v1/apps", APP_STORE_CONNECT_API);
  url.searchParams.set("filter[bundleId]", bundleId);
  url.searchParams.set("fields[apps]", "name,bundleId,primaryLocale,subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox");
  url.searchParams.set("limit", "2");
  const payload = await api(url.toString());
  const apps = payload?.data || [];
  if (apps.length !== 1) {
    throw new Error(`Expected exactly one App Store app for ${bundleId}; found ${apps.length}.`);
  }
  return apps[0];
}

async function ensureNotificationUrls(api, app, notificationUrl) {
  const attrs = app.attributes || {};
  const correct = attrs.subscriptionStatusUrl === notificationUrl
    && attrs.subscriptionStatusUrlVersion === "V2"
    && attrs.subscriptionStatusUrlForSandbox === notificationUrl
    && attrs.subscriptionStatusUrlVersionForSandbox === "V2";
  if (correct) return;

  await api(`/v1/apps/${app.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "apps",
        id: app.id,
        attributes: {
          subscriptionStatusUrl: notificationUrl,
          subscriptionStatusUrlVersion: "V2",
          subscriptionStatusUrlForSandbox: notificationUrl,
          subscriptionStatusUrlVersionForSandbox: "V2",
        },
      },
    }),
  });
  console.log(`Configured App Store Server Notifications V2: ${notificationUrl}`);
}

async function ensureSubscriptionGroup(api, appId) {
  const payload = await api(`/v1/apps/${appId}/subscriptionGroups?fields[subscriptionGroups]=referenceName&limit=200`);
  const matching = (payload?.data || []).filter((group) => group.attributes?.referenceName === GROUP_REFERENCE_NAME);
  if (matching.length > 1) throw new Error("Multiple Tok One subscription groups exist; refusing to choose automatically.");
  if (matching.length === 1) return matching[0];

  const created = await api("/v1/subscriptionGroups", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "subscriptionGroups",
        attributes: { referenceName: GROUP_REFERENCE_NAME },
        relationships: {
          app: { data: { type: "apps", id: appId } },
        },
      },
    }),
  });
  console.log(`Created subscription group ${GROUP_REFERENCE_NAME} (${created.data.id}).`);
  return created.data;
}

async function ensureGroupLocalization(api, groupId) {
  const current = await api(`/v1/subscriptionGroups/${groupId}/subscriptionGroupLocalizations?fields[subscriptionGroupLocalizations]=name,customAppName,locale,state&limit=200`);
  if ((current?.data || []).some((row) => row.attributes?.locale === "fr-FR")) return;

  await api("/v1/subscriptionGroupLocalizations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "subscriptionGroupLocalizations",
        attributes: { locale: "fr-FR", name: "Tok One" },
        relationships: {
          subscriptionGroup: { data: { type: "subscriptionGroups", id: groupId } },
        },
      },
    }),
  });
  console.log("Created Tok One fr-FR subscription-group localization.");
}

async function listSubscriptions(api, groupId) {
  return api(`/v1/subscriptionGroups/${groupId}/subscriptions?fields[subscriptions]=name,productId,familySharable,state,subscriptionPeriod,reviewNote,groupLevel&limit=200`);
}

async function ensureSubscription(api, groupId, product) {
  const current = await listSubscriptions(api, groupId);
  const matching = (current?.data || []).filter((row) => row.attributes?.productId === product.productId);
  if (matching.length > 1) throw new Error(`Multiple subscriptions use product ID ${product.productId}.`);
  if (matching.length === 1) return matching[0];

  const reviewNote = [
    "Tok One is the consumer membership offered inside TheTok on iOS through StoreKit 2.",
    "The iOS app does not route this digital subscription to Stripe.",
    "Food orders, reservations and restaurant services are physical services and use the separate marketplace payment flow.",
    "Use the App Review client account supplied with the app version to test purchase and entitlement activation.",
  ].join(" ");

  const created = await api("/v1/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "subscriptions",
        attributes: {
          name: product.internalName,
          productId: product.productId,
          familySharable: false,
          subscriptionPeriod: product.subscriptionPeriod,
          groupLevel: 1,
          reviewNote,
        },
        relationships: {
          group: { data: { type: "subscriptionGroups", id: groupId } },
        },
      },
    }),
  });
  console.log(`Created ${product.productId} (${created.data.id}).`);
  return created.data;
}

async function ensureSubscriptionLocalization(api, subscriptionId, product) {
  const current = await api(`/v1/subscriptions/${subscriptionId}/subscriptionLocalizations?fields[subscriptionLocalizations]=name,locale,description,state&limit=200`);
  if ((current?.data || []).some((row) => row.attributes?.locale === "fr-FR")) return;

  await api("/v1/subscriptionLocalizations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "subscriptionLocalizations",
        attributes: {
          locale: "fr-FR",
          name: product.localizedName,
          description: product.localizedDescription,
        },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
        },
      },
    }),
  });
  console.log(`Created fr-FR localization for ${product.productId}.`);
}

async function ensureSwissAvailability(api, subscriptionId) {
  const url = new URL(`/v1/subscriptions/${subscriptionId}/subscriptionAvailability`, APP_STORE_CONNECT_API);
  url.searchParams.set("include", "availableTerritories");
  url.searchParams.set("limit[availableTerritories]", "50");

  let existing = null;
  try {
    existing = await api(url.toString());
  } catch (error) {
    if (!String(error?.message || error).includes("HTTP 404")) throw error;
  }

  if (existing?.data) {
    const territoryIds = (existing.included || [])
      .filter((row) => row.type === "territories")
      .map((row) => row.id)
      .sort();
    if (territoryIds.length === 1 && territoryIds[0] === DEFAULT_TERRITORY) return;
    throw new Error(
      `Subscription ${subscriptionId} already has availability [${territoryIds.join(", ")}]; refusing a destructive territory rewrite.`,
    );
  }

  await api("/v1/subscriptionAvailabilities", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "subscriptionAvailabilities",
        attributes: { availableInNewTerritories: false },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
          availableTerritories: {
            data: [{ type: "territories", id: DEFAULT_TERRITORY }],
          },
        },
      },
    }),
  });
  console.log(`Restricted subscription ${subscriptionId} availability to Switzerland (${DEFAULT_TERRITORY}).`);
}

function samePrice(a, b) {
  return Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) < 0.001;
}

async function findSwissPricePoint(api, subscriptionId, customerPrice) {
  const url = new URL(`/v1/subscriptions/${subscriptionId}/pricePoints`, APP_STORE_CONNECT_API);
  url.searchParams.set("filter[territory]", DEFAULT_TERRITORY);
  url.searchParams.set("fields[subscriptionPricePoints]", "customerPrice,proceeds,proceedsYear2");
  url.searchParams.set("limit", "8000");
  const payload = await api(url.toString());
  const matches = (payload?.data || []).filter((row) => samePrice(row.attributes?.customerPrice, customerPrice));
  if (matches.length !== 1) {
    throw new Error(
      `Could not resolve exactly one Swiss price point for CHF ${customerPrice}; found ${matches.length}.`,
    );
  }
  return matches[0];
}

async function ensureSwissPrice(api, subscriptionId, product) {
  const currentUrl = new URL(`/v1/subscriptions/${subscriptionId}/prices`, APP_STORE_CONNECT_API);
  currentUrl.searchParams.set("filter[territory]", DEFAULT_TERRITORY);
  currentUrl.searchParams.set("include", "subscriptionPricePoint,territory");
  currentUrl.searchParams.set("fields[subscriptionPricePoints]", "customerPrice");
  currentUrl.searchParams.set("limit", "200");
  const current = await api(currentUrl.toString());
  const includedPricePoints = new Map(
    (current?.included || [])
      .filter((row) => row.type === "subscriptionPricePoints")
      .map((row) => [row.id, row]),
  );
  const alreadyConfigured = (current?.data || []).some((price) => {
    const pricePointId = price.relationships?.subscriptionPricePoint?.data?.id;
    return pricePointId && samePrice(includedPricePoints.get(pricePointId)?.attributes?.customerPrice, product.customerPrice);
  });
  if (alreadyConfigured) return;

  const pricePoint = await findSwissPricePoint(api, subscriptionId, product.customerPrice);
  const startDate = new Date().toISOString().slice(0, 10);
  await api("/v1/subscriptionPrices", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "subscriptionPrices",
        attributes: {
          startDate,
          preserveCurrentPrice: false,
        },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
          subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: pricePoint.id } },
        },
      },
    }),
  });
  console.log(`Configured ${product.productId} at CHF ${product.customerPrice}.`);
}

async function readFinalState(api, subscriptionId) {
  return api(`/v1/subscriptions/${subscriptionId}?fields[subscriptions]=name,productId,state,subscriptionPeriod,groupLevel,reviewNote`);
}

async function main() {
  const credentials = {
    issuerId: requireEnv("APP_STORE_CONNECT_ISSUER_ID"),
    keyId: requireEnv("APP_STORE_CONNECT_KEY_ID"),
    privateKey: normalizePrivateKey(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY")),
  };
  const api = apiClient(credentials);
  const bundleId = process.env.IOS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;
  const notificationUrl = process.env.APPLE_STOREKIT_NOTIFICATION_URL?.trim() || DEFAULT_NOTIFICATION_URL;

  const app = await findApp(api, bundleId);
  console.log(`Configuring Tok One for ${app.attributes?.name || "TheTok"} (${app.id}, ${bundleId}).`);
  await ensureNotificationUrls(api, app, notificationUrl);

  const group = await ensureSubscriptionGroup(api, app.id);
  await ensureGroupLocalization(api, group.id);

  const results = {};
  for (const product of PRODUCTS) {
    const subscription = await ensureSubscription(api, group.id, product);
    await ensureSubscriptionLocalization(api, subscription.id, product);
    await ensureSwissAvailability(api, subscription.id);
    await ensureSwissPrice(api, subscription.id, product);
    const finalState = await readFinalState(api, subscription.id);
    results[product.key] = {
      id: subscription.id,
      productId: product.productId,
      state: finalState?.data?.attributes?.state || "unknown",
      priceChf: product.customerPrice,
    };
  }

  console.log("Tok One App Store configuration completed:");
  console.log(JSON.stringify({ appId: app.id, groupId: group.id, notificationUrl, products: results }, null, 2));

  await writeGithubOutput("app_id", app.id);
  await writeGithubOutput("subscription_group_id", group.id);
  await writeGithubOutput("monthly_subscription_id", results.monthly.id);
  await writeGithubOutput("yearly_subscription_id", results.yearly.id);
  await writeGithubOutput("monthly_state", results.monthly.state);
  await writeGithubOutput("yearly_state", results.yearly.state);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Tok One App Store configuration failed: ${message}`);
  if (/agreement|contract|bank|tax|paid app|paid applications/i.test(message)) {
    console.error("ACTION_REQUIRED_ACCOUNT_HOLDER: verify Paid Apps Agreement, banking and tax information in App Store Connect > Business.");
  }
  process.exit(1);
});
