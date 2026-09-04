import { describe, expect, it } from "vitest";

import { classifyRecoveryEmailProviderError } from "../../supabase/functions/crm-mfa-recovery/provider-error.ts";

function resendResponse(
  status: number,
  payload: unknown,
  contentType = "application/json",
) {
  return new Response(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    {
      status,
      headers: { "content-type": contentType },
    },
  );
}

describe("CRM MFA Resend provider error classification", () => {
  it("identifies an unverified sender domain without returning provider text", async () => {
    const classified = await classifyRecoveryEmailProviderError(
      resendResponse(403, {
        name: "validation_error",
        message:
          "The thetok.ch domain is not verified; contact private@example.test with sk-secret-material.",
      }),
    );

    expect(classified).toEqual({
      status: 503,
      message: "recovery_email_sender_domain_unverified",
      metadata: {
        provider: "resend",
        provider_status: 403,
        provider_error_code: "validation_error",
        sender_domain_unverified: true,
      },
    });
    expect(JSON.stringify(classified)).not.toContain("private@example.test");
    expect(JSON.stringify(classified)).not.toContain("sk-secret-material");
  });

  it.each([
    {
      status: 401,
      payload: { name: "authentication_error", message: "invalid key" },
      expected: "recovery_email_provider_misconfigured",
      responseStatus: 503,
    },
    {
      status: 429,
      payload: { name: "rate_limit_exceeded", message: "slow down" },
      expected: "recovery_email_provider_rate_limited",
      responseStatus: 503,
    },
    {
      status: 503,
      payload: { name: "application_error", message: "outage" },
      expected: "recovery_email_provider_unavailable",
      responseStatus: 502,
    },
    {
      status: 422,
      payload: "not-json",
      expected: "recovery_email_delivery_failed",
      responseStatus: 502,
    },
  ])(
    "maps Resend HTTP $status to $expected",
    async ({ status, payload, expected, responseStatus }) => {
      const classified = await classifyRecoveryEmailProviderError(
        resendResponse(
          status,
          payload,
          typeof payload === "string" ? "text/plain" : "application/json",
        ),
      );

      expect(classified.status).toBe(responseStatus);
      expect(classified.message).toBe(expected);
      expect(classified.metadata.provider).toBe("resend");
      expect(classified.metadata.provider_status).toBe(status);
      expect(classified.metadata.sender_domain_unverified).toBe(false);
    },
  );

  it("rejects an unsafe provider error code", async () => {
    const classified = await classifyRecoveryEmailProviderError(
      resendResponse(400, {
        name: "validation_error\nAuthorization: Bearer secret",
        message: "invalid request",
      }),
    );

    expect(classified.metadata.provider_error_code).toBeNull();
    expect(classified.message).toBe("recovery_email_delivery_failed");
  });
});
