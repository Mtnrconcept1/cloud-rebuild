const MIN_UNSUBSCRIBE_SECRET_LENGTH = 32;

type UnsubscribeSecretInput = {
  primary?: string | null;
  legacy?: string | null;
};

export type MarketingUnsubscribeSecrets = {
  signingSecret: string;
  verificationSecrets: readonly string[];
};

function normalizeSecret(value: string | null | undefined) {
  const secret = value?.trim() || "";
  return secret.length >= MIN_UNSUBSCRIBE_SECRET_LENGTH ? secret : "";
}

/**
 * The primary unsubscribe secret is mandatory. The legacy secret is accepted
 * only alongside a valid primary secret, which makes it a rotation aid rather
 * than a fallback configuration. New links are always signed with the primary
 * secret; the legacy value is verification-only for links already delivered.
 */
export function resolveMarketingUnsubscribeSecrets(
  input: UnsubscribeSecretInput,
): MarketingUnsubscribeSecrets {
  const primary = normalizeSecret(input.primary);
  if (!primary) {
    return { signingSecret: "", verificationSecrets: [] };
  }

  const legacy = normalizeSecret(input.legacy);
  return {
    signingSecret: primary,
    verificationSecrets: legacy && legacy !== primary
      ? [primary, legacy]
      : [primary],
  };
}

export function readMarketingUnsubscribeSecrets(): MarketingUnsubscribeSecrets {
  return resolveMarketingUnsubscribeSecrets({
    primary: Deno.env.get("MARKETING_UNSUBSCRIBE_SECRET"),
    legacy: Deno.env.get("MARKETING_UNSUBSCRIBE_LEGACY_SECRET"),
  });
}
