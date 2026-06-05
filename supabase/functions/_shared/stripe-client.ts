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

type SecretCandidate = {
  name: string;
  value: string;
};

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
    .filter(Boolean);
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

  return buildRuntime(candidate, Boolean(input.isolatedTokOneKey && candidate.name !== "STRIPE_SECRET_KEY"));
}

export function getStripeRuntimeForCheckoutKind(checkoutKind: unknown) {
  const kind = normalizeCheckoutKind(checkoutKind);
  if (kind === "tok-one") {
    return selectRuntime({
      names: ["STRIPE_TOK_ONE_TEST_SECRET_KEY", "STRIPE_TOK_ONE_SECRET_KEY", "STRIPE_SECRET_KEY"],
      purpose: "Tok One Stripe secret",
      isolatedTokOneKey: true,
    });
  }

  return selectRuntime({
    names: ["STRIPE_SECRET_KEY"],
    purpose: "STRIPE_SECRET_KEY",
  });
}

export function getTokOneStripeRuntime(preferredMode?: unknown) {
  const mode = normalizeRuntimeMode(preferredMode);

  if (mode === "test") {
    return selectRuntime({
      names: ["STRIPE_TOK_ONE_TEST_SECRET_KEY", "STRIPE_TOK_ONE_SECRET_KEY", "STRIPE_SECRET_KEY"],
      purpose: "Tok One Stripe secret",
      expectedMode: "test",
      isolatedTokOneKey: true,
    });
  }

  if (mode === "live") {
    return selectRuntime({
      names: ["STRIPE_TOK_ONE_SECRET_KEY", "STRIPE_SECRET_KEY"],
      purpose: "Tok One Stripe secret",
      expectedMode: "live",
      isolatedTokOneKey: true,
    });
  }

  return getStripeRuntimeForCheckoutKind("tok-one");
}

export function getStripeVerificationRuntime() {
  return selectRuntime({
    names: ["STRIPE_SECRET_KEY", "STRIPE_TOK_ONE_TEST_SECRET_KEY", "STRIPE_TOK_ONE_SECRET_KEY"],
    purpose: "Stripe verification secret",
  });
}

export function getStripeWebhookSigningSecrets() {
  return Array.from(
    new Set([
      ...splitSecrets(getEnv("STRIPE_WEBHOOK_SECRET")),
      ...splitSecrets(getEnv("STRIPE_WEBHOOK_SIGNING_SECRET")),
      ...splitSecrets(getEnv("STRIPE_TOK_ONE_TEST_WEBHOOK_SECRET")),
      ...splitSecrets(getEnv("STRIPE_TOK_ONE_TEST_WEBHOOK_SIGNING_SECRET")),
      ...splitSecrets(getEnv("STRIPE_TOK_ONE_WEBHOOK_SECRET")),
      ...splitSecrets(getEnv("STRIPE_TOK_ONE_WEBHOOK_SIGNING_SECRET")),
    ]),
  );
}
