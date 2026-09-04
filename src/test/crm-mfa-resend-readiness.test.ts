import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { verifySupabaseRuntimeSecurity } from "../../scripts/verify-supabase-runtime-security.mjs";

const PRODUCTION_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const edgeFunction = readFileSync(
  "supabase/functions/crm-mfa-recovery/index.ts",
  "utf8",
);
const providerError = readFileSync(
  "supabase/functions/crm-mfa-recovery/provider-error.ts",
  "utf8",
);
const runtimePreflight = readFileSync(
  "scripts/verify-supabase-runtime-security.mjs",
  "utf8",
);

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CRM MFA Resend readiness", () => {
  it("classifies an unverified sender domain without exposing provider text", () => {
    expect(edgeFunction).toContain("RecoveryEmailProviderError");
    expect(edgeFunction).toContain('"Idempotency-Key": `crm-mfa-recovery-${challengeId}`');
    expect(edgeFunction).toContain('"User-Agent": "TOK-CRM-MFA-Recovery/1.0"');
    expect(providerError).toContain("recovery_email_sender_domain_unverified");
    expect(providerError).toContain("provider_status");
    expect(providerError).toContain("provider_error_code");
    expect(edgeFunction).not.toContain("throw new HttpError(502, \"recovery_email_delivery_failed\")");
  });

  it("performs a controlled live delivery test for the configured production sender", async () => {
    const resendApiKey = "re_live_sender_readiness_secret";
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const responses = [
      jsonResponse([{ internal_cron_secret_ready: true, verifier_ready: true }], 201),
      jsonResponse([{ name: "RESEND_API_KEY" }]),
      jsonResponse({ id: "email_test_id" }),
    ];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responses.shift() as Response;
    });

    const result = await verifySupabaseRuntimeSecurity({
      projectRef: PRODUCTION_PROJECT_REF,
      accessToken: "sbp_test_token_that_is_long_enough",
      resendApiKey,
      emailFrom: "Tok <noreply@thetok.ch>",
      fetchImpl,
      wait: async () => undefined,
      now: () => new Date("2026-07-26T05:30:00.000Z"),
    });

    expect(calls.map((call) => call.init.method)).toEqual(["POST", "GET", "POST"]);
    expect(calls[2].url).toBe("https://api.resend.com/emails");
    expect(calls[2].init.headers).toMatchObject({
      "User-Agent": "TOK-Production-Preflight/1.0",
    });
    expect(String(calls[2].init.body)).toContain(
      "delivered+tok-production-preflight@resend.dev",
    );
    expect(String(calls[2].init.body)).toContain("noreply@thetok.ch");
    expect(result.resendConfirmed).toBe("true");
    expect(result.resendEvidence).toContain("controlled delivery test");
    expect(JSON.stringify(result)).not.toContain(resendApiKey);
  });

  it("blocks production when Resend rejects the sender domain", async () => {
    const resendApiKey = "re_live_sender_secret_that_must_not_leak";
    const providerMessage =
      "The thetok.ch domain is not verified. Please, add and verify your domain.";
    const responses = [
      jsonResponse([{ internal_cron_secret_ready: true, verifier_ready: true }], 201),
      jsonResponse([{ name: "RESEND_API_KEY" }]),
      jsonResponse(
        {
          name: "validation_error",
          message: providerMessage,
        },
        403,
      ),
    ];
    const fetchImpl = vi.fn(async () => responses.shift() as Response);

    let message = "";
    try {
      await verifySupabaseRuntimeSecurity({
        projectRef: PRODUCTION_PROJECT_REF,
        accessToken: "sbp_test_token_that_is_long_enough",
        resendApiKey,
        emailFrom: "Tok <noreply@thetok.ch>",
        fetchImpl,
        wait: async () => undefined,
        now: () => new Date("2026-07-26T05:30:00.000Z"),
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("HTTP 403");
    expect(message).toContain("Verify the sender domain DNS");
    expect(message).not.toContain(resendApiKey);
    expect(message).not.toContain(providerMessage);
  });

  it("enables live sender validation in the production workflow entrypoint", () => {
    expect(runtimePreflight).toContain(
      "emailFrom: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM",
    );
    expect(runtimePreflight).toContain("RESEND_TEST_RECIPIENT");
    expect(runtimePreflight).toContain("Idempotency-Key");
  });
});
