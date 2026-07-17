import Stripe from "npm:stripe@18.5.0";

import { getEnv, HttpError } from "./auth.ts";

export const STRIPE_API_VERSION = "2025-08-27.basil";

export type StripeRuntimeMode = "live" | "test";

export type StripeRuntime = {
  stripe: Stripe;
  secretKeyName: string;
  mode: StripeRuntimeMode;
  isolatedTokOneKey: boolean;
};

export type StripeWebhookSigningSecret = {
  secret: string;
  expectedMode: StripeRuntimeMode;
  source: string;
};

type SecretCandidate = {
  name: string;
  value: string;
};

function isPlatformStripeSecretName(name: string) {
  return (
    name === "STRIPE_PERSONNAL_SECRET_KEY" ||
    name === "STRIPE_PERSONAL_SECRET_KEY" ||
    name === "STRIPE_SECRET_KEY" ||
    name === "STRIPE_SECRET_KEY_LIVE"
  );
}

function normalizeCheckoutKind(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRuntimeMode(value: unknown): StripeRuntimeMode | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "test") return "test";
  if (normalized === "live") return "live";
  return null;
}

function splitSecrets(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(/[,\n]/)
    .map((secret) => secret.trim())
    .filter((secret) => secret.startsWith("whsec_"));
}

function readWebhookSigningSecrets(
  names: string[],
  expectedMode: StripeRuntimeMode,
): StripeWebhookSigningSecret[] {
  return names.flatMap((name) =>
    splitSecrets(getEnv(name)).map((secret) => ({
      secret,
      expectedMode,
      source: name,
    }))
  );
}

export function mergeStripeWebhookSigningSecrets(
  candidates: StripeWebhookSigningSecret[],
) {
  const bySecret = new Map<string, StripeWebhookSigningSecret>();

  for (const candidate of candidates) {
    if (!candidate.secret.startsWith("whsec_")) continue;

    const existing = bySecret.get(candidate.secret);
    if (existing && existing.expectedMode !== candidate.expectedMode) {
      throw new HttpError(503, "STRIPE_WEBHOOK_SECRET_MODE_CONFLICT");
    }
    if (!existing) bySecret.set(candidate.secret, candidate);
  }

  return Array.from(bySecret.values());
}

export function stripeWebhookEventMatchesExpectedMode(
  livemode: boolean,
  expectedMode: StripeRuntimeMode,
) {
  return livemode === (expectedMode === "live");
}

function readCandidates(names: string[]) {
  return names
    .map((name) => ({ name, value: getEnv(name) }))
    .filter((candidate): candidate is SecretCandidate => Boolean(candidate.value));
}

export function inferStripeRuntimeMode(secretKey: string): StripeRuntimeMode {
  return secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_") ? "test" : "live";
}

export function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

function buildRuntime(candidate: SecretCandidate, isolatedTokOneKey = false): StripeRuntime {
  return {
    stripe: createStripeClient(candidate.value),
    secretKeyName: candidate.name,
    mode: inferStripeRuntimeMode(candidate.value),
    isolatedTokOneKey,
  };
}

function selectRuntime(input: {
  names: string[];
  purpose: string;
  expectedMode?: StripeRuntimeMode | null;
  isolatedTokOneKey?: boolean;
}) {
  const candidates = readCandidates(input.names);
  const expectedMode = input.expectedMode || null;
  const candidate = expectedMode
    ? candidates.find((entry) => inferStripeRuntimeMode(entry.value) === expectedMode)
    : candidates[0];

  if (!candidate) {
    const modeSuffix = expectedMode ? ` (${expectedMode})` : "";
    throw new HttpError(503, `${input.purpose}${modeSuffix} not configured`);
  }

  return buildRuntime(candidate, Boolean(input.isolatedTokOneKey && !isPlatformStripeSecretName(candidate.name)));
}

export function getStripeRuntimeForCheckoutKind(checkoutKind: unknown) {
  const kind = normalizeCheckoutKind(checkoutKind);
  if (kind === "commercial-demo-order") {
    throw new HttpError(400, "DEMO_CHECKOUT_REQUIRES_TEST_ENDPOINT");
  }
  if (kind === "tok-one") {
    return selectRuntime({
      names: [
        "STRIPE_TOK_ONE_SECRET_KEY",
        "STRIPE_TOK_ONE_TEST_SECRET_KEY",
        "STRIPE_PERSONNAL_SECRET_KEY",
        "STRIPE_PERSONAL_SECRET_KEY",
        "STRIPE_SECRET_KEY_LIVE",
        "STRIPE_SECRET_KEY",
      ],
      purpose: "Tok One Stripe secret",
      expectedMode: "live",
      isolatedTokOneKey: true,
    });
  }

  return selectRuntime({
    names: ["STRIPE_PERSONNAL_SECRET_KEY", "STRIPE_PERSONAL_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE", "STRIPE_SECRET_KEY"],
    purpose: "STRIPE_SECRET_KEY",
    expectedMode: "live",
  });
}

/**
 * Resolve the Stripe account for an already persisted payment attempt.
 *
 * Recovery endpoints must never silently fall back from Test to Live (or the
 * reverse): a Checkout id is only meaningful in the account/mode that created
 * it. Creation keeps using getStripeRuntimeForCheckoutKind, while recovery
 * always pins the persisted mode through this helper.
 */
export function getStripeRuntimeForCheckoutKindAndMode(
  checkoutKind: unknown,
  preferredMode: unknown,
) {
  const kind = normalizeCheckoutKind(checkoutKind);
  const mode = normalizeRuntimeMode(preferredMode);
  if (!mode) throw new HttpError(400, "Invalid Stripe runtime mode");

  if (kind === "commercial-demo-order" || kind === "commercial_demo_order") {
    if (mode !== "test") throw new HttpError(400, "Commercial demo requires Stripe Test");
    return getCommercialDemoStripeRuntime();
  }

  if (kind === "tok-one") return getTokOneStripeRuntime(mode);

  return selectRuntime({
    names: mode === "test"
      ? [
        "STRIPE_SECRET_KEY_TEST",
        "STRIPE_TOK_ONE_TEST_SECRET_KEY",
        "STRIPE_SECRET_KEY",
      ]
      : [
        "STRIPE_PERSONNAL_SECRET_KEY",
        "STRIPE_PERSONAL_SECRET_KEY",
        "STRIPE_SECRET_KEY_LIVE",
        "STRIPE_SECRET_KEY",
      ],
    purpose: "Stripe recovery secret",
    expectedMode: mode,
  });
}

/**
 * Stripe runtime reserved for the interactive commercial demonstration.
 *
 * Only values whose actual prefix identifies Stripe Test are accepted. The
 * historical Tok One name is supported for compatibility, but a live value
 * under that name is ignored and can never become the demo runtime.
 */
export function getCommercialDemoStripeRuntime() {
  const candidates = readCandidates([
    "STRIPE_SECRET_KEY_TEST",
    "STRIPE_TOK_ONE_TEST_SECRET_KEY",
    "STRIPE_TOK_ONE_SECRET_KEY",
  ]);

  if (candidates.length === 0) {
    throw new HttpError(503, "DEMO_STRIPE_NOT_CONFIGURED");
  }

  const candidate = candidates.find((entry) => inferStripeRuntimeMode(entry.value) === "test");
  if (!candidate) {
    throw new HttpError(503, "INVALID_TEST_STRIPE_KEY");
  }

  return buildRuntime(candidate, candidate.name.startsWith("STRIPE_TOK_ONE"));
}

export function getTokOneStripeRuntime(preferredMode?: unknown) {
  const mode = normalizeRuntimeMode(preferredMode);

  if (mode === "test") {
    return selectRuntime({
      names: [
        "STRIPE_TOK_ONE_TEST_SECRET_KEY",
        "STRIPE_TOK_ONE_SECRET_KEY",
        "STRIPE_PERSONNAL_SECRET_KEY",
        "STRIPE_PERSONAL_SECRET_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_SECRET_KEY_LIVE",
      ],
      purpose: "Tok One Stripe test secret",
      expectedMode: "test",
      isolatedTokOneKey: true,
    });
  }

  if (mode === "live") {
    return selectRuntime({
      names: [
        "STRIPE_TOK_ONE_SECRET_KEY",
        "STRIPE_PERSONNAL_SECRET_KEY",
        "STRIPE_PERSONAL_SECRET_KEY",
        "STRIPE_SECRET_KEY_LIVE",
        "STRIPE_SECRET_KEY",
      ],
      purpose: "Tok One Stripe secret",
      expectedMode: "live",
      isolatedTokOneKey: true,
    });
  }

  return getStripeRuntimeForCheckoutKind("tok-one");
}

export function getTokOneStripeRuntimeForCheckoutSession(sessionId: string) {
  if (sessionId.startsWith("cs_test_")) return getTokOneStripeRuntime("test");
  if (sessionId.startsWith("cs_live_")) return getTokOneStripeRuntime("live");
  return getTokOneStripeRuntime();
}

export function getStripeVerificationRuntime() {
  return selectRuntime({
    names: [
      "STRIPE_PERSONNAL_SECRET_KEY",
      "STRIPE_PERSONAL_SECRET_KEY",
      "STRIPE_SECRET_KEY_LIVE",
      "STRIPE_SECRET_KEY",
      "STRIPE_TOK_ONE_SECRET_KEY",
    ],
    purpose: "Stripe verification secret",
    expectedMode: "live",
  });
}

export function getStripeWebhookSigningSecrets() {
  return mergeStripeWebhookSigningSecrets([
    ...readWebhookSigningSecrets([
      "STRIPE_LIVE_WEBHOOK",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_WEBHOOK_SECRET_LIVE",
      "STRIPE_WEBHOOK_SIGNING_SECRET",
      "STRIPE_WEBHOOK_SIGNING_SECRET_LIVE",
      "STRIPE_TOK_ONE_WEBHOOK_SECRET",
      "STRIPE_TOK_ONE_WEBHOOK_SIGNING_SECRET",
    ], "live"),
    ...readWebhookSigningSecrets([
      "STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET",
      "STRIPE_TOK_ONE_TEST_WEBHOOK_SIGNING_SECRET",
    ], "test"),
  ]);
}
