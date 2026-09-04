export type RecoveryEmailProviderMetadata = {
  provider: "resend";
  provider_status: number;
  provider_error_code: string | null;
  sender_domain_unverified: boolean;
};

export type RecoveryEmailProviderClassification = {
  status: number;
  message: string;
  metadata: RecoveryEmailProviderMetadata;
};

const PROVIDER_CODE_PATTERN = /^[a-z0-9_-]{1,64}$/i;

function normalizeProviderCode(value: unknown): string | null {
  return typeof value === "string" && PROVIDER_CODE_PATTERN.test(value)
    ? value
    : null;
}

export async function classifyRecoveryEmailProviderError(
  response: Response,
): Promise<RecoveryEmailProviderClassification> {
  let providerErrorCode: string | null = null;
  let providerMessage = "";

  try {
    const payload = await response.json() as Record<string, unknown>;
    providerErrorCode = normalizeProviderCode(payload.name);
    providerMessage = typeof payload.message === "string"
      ? payload.message.slice(0, 500)
      : "";
  } catch {
    providerErrorCode = null;
    providerMessage = "";
  }

  const senderDomainUnverified = response.status === 403
    && providerErrorCode === "validation_error"
    && /domain\b.*\bnot verified|verify (?:your|a) domain/i.test(
      providerMessage,
    );

  let status = 502;
  let message = "recovery_email_delivery_failed";

  if (senderDomainUnverified) {
    status = 503;
    message = "recovery_email_sender_domain_unverified";
  } else if (response.status === 401 || response.status === 403) {
    status = 503;
    message = "recovery_email_provider_misconfigured";
  } else if (response.status === 429) {
    status = 503;
    message = "recovery_email_provider_rate_limited";
  } else if (response.status >= 500) {
    status = 502;
    message = "recovery_email_provider_unavailable";
  }

  return {
    status,
    message,
    metadata: {
      provider: "resend",
      provider_status: response.status,
      provider_error_code: providerErrorCode,
      sender_domain_unverified: senderDomainUnverified,
    },
  };
}
