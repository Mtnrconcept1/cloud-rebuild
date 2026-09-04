import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  classifyRecoveryEmailProviderError,
  type RecoveryEmailProviderMetadata,
} from "./provider-error.ts";

const FUNCTION_NAME = "crm-mfa-recovery";
const CRM_MFA_FRIENDLY_NAME = "TOK CRM";
const CODE_LENGTH = 8;
const CODE_TTL_MINUTES = 10;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class RecoveryEmailProviderError extends HttpError {
  readonly providerMetadata: RecoveryEmailProviderMetadata;

  constructor(
    status: number,
    message: string,
    providerMetadata: RecoveryEmailProviderMetadata,
  ) {
    super(status, message);
    this.name = "RecoveryEmailProviderError";
    this.providerMetadata = providerMetadata;
  }
}

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, "") : "";
}

function generateRecoveryCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % (10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

async function hashRecoveryCode(
  challengeId: string,
  userId: string,
  code: string,
) {
  const pepper = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const data = new TextEncoder().encode(
    `${pepper}:${challengeId}:${userId}:${code}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "votre adresse vérifiée";
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"*".repeat(Math.max(3, localPart.length - visible.length))}@${domain}`;
}

async function sendRecoveryEmail(
  email: string,
  code: string,
  challengeId: string,
) {
  const resendApiKey = getEnv("RESEND_API_KEY");
  if (!resendApiKey) throw new HttpError(503, "recovery_email_unavailable");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `crm-mfa-recovery-${challengeId}`,
      "User-Agent": "TOK-CRM-MFA-Recovery/1.0",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") || "TOK <noreply@thetok.ch>",
      to: email,
      subject: "Code de récupération CRM TOK",
      text: [
        "Une récupération de l'application d'authentification CRM a été demandée.",
        `Votre code est : ${code}`,
        `Il expire dans ${CODE_TTL_MINUTES} minutes.`,
        "Si vous n'êtes pas à l'origine de cette demande, ne communiquez pas ce code et contactez le support TOK.",
      ].join("\n\n"),
      html: [
        "<p>Une récupération de l'application d'authentification CRM a été demandée.</p>",
        `<p>Votre code est : <strong style="font-size:20px;letter-spacing:3px">${code}</strong></p>`,
        `<p>Il expire dans ${CODE_TTL_MINUTES} minutes.</p>`,
        "<p>Si vous n'êtes pas à l'origine de cette demande, ne communiquez pas ce code et contactez le support TOK.</p>",
      ].join(""),
    }),
  });

  if (!response.ok) {
    const classified = await classifyRecoveryEmailProviderError(response);
    throw new RecoveryEmailProviderError(
      classified.status,
      classified.message,
      classified.metadata,
    );
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  const adminClient = createAdminClient();
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let challengeId: string | null = null;
  let action = "unknown";

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    actor = await authenticateRequest(req);
    requireUserRole(
      actor,
      ["admin", "restaurateur"],
      "CRM MFA recovery requires an admin or restaurant account",
    );
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const payload = await req.json().catch(() => ({}));
    action = typeof payload?.action === "string" ? payload.action : "";
    const limiter = createRateLimiter(adminClient, FUNCTION_NAME);

    if (action === "request") {
      await limiter.consume(`user:${actor.userId}:request`, {
        maxRequests: 3,
        windowSeconds: 900,
      });
      await limiter.consume("global:request", {
        maxRequests: 30,
        windowSeconds: 60,
      });

      const { data: userData, error: userError } =
        await adminClient.auth.admin.getUserById(actor.userId);
      const email = userData?.user?.email?.trim().toLowerCase() || "";
      if (userError || !email || !userData?.user?.email_confirmed_at) {
        throw new HttpError(409, "verified_account_email_required");
      }

      await adminClient
        .from("crm_mfa_recovery_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("user_id", actor.userId)
        .is("consumed_at", null);

      challengeId = crypto.randomUUID();
      const code = generateRecoveryCode();
      const codeHash = await hashRecoveryCode(
        challengeId,
        actor.userId,
        code,
      );
      const expiresAt = new Date(
        Date.now() + CODE_TTL_MINUTES * 60_000,
      ).toISOString();

      const { error: insertError } = await adminClient
        .from("crm_mfa_recovery_challenges")
        .insert({
          id: challengeId,
          user_id: actor.userId,
          code_hash: codeHash,
          attempts_remaining: 5,
          expires_at: expiresAt,
        });
      if (insertError) {
        throw new HttpError(500, "recovery_challenge_create_failed");
      }

      try {
        await sendRecoveryEmail(email, code, challengeId);
      } catch (emailError) {
        await adminClient
          .from("crm_mfa_recovery_challenges")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", challengeId);
        throw emailError;
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: FUNCTION_NAME,
        action: "request_crm_mfa_recovery",
        status: "success",
        targetEntityType: "crm_mfa_recovery_challenge",
        targetEntityId: challengeId,
        metadata: {
          rid: log.rid,
          expires_in_minutes: CODE_TTL_MINUTES,
        },
      });

      return jsonResponse(
        {
          ok: true,
          challengeId,
          destination: maskEmail(email),
          expiresInSeconds: CODE_TTL_MINUTES * 60,
        },
        200,
        corsHeaders,
      );
    }

    if (action === "confirm") {
      await limiter.consume(`user:${actor.userId}:confirm`, {
        maxRequests: 10,
        windowSeconds: 600,
      });

      challengeId =
        typeof payload?.challengeId === "string"
          ? payload.challengeId.trim()
          : "";
      const code = normalizeCode(payload?.code);
      if (
        !UUID_PATTERN.test(challengeId) ||
        !new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)
      ) {
        throw new HttpError(400, "invalid_recovery_challenge");
      }

      const codeHash = await hashRecoveryCode(
        challengeId,
        actor.userId,
        code,
      );
      const { data: verificationStatus, error: verificationError } =
        await adminClient.rpc("consume_crm_mfa_recovery_challenge", {
          p_challenge_id: challengeId,
          p_user_id: actor.userId,
          p_code_hash: codeHash,
        });
      if (verificationError) {
        throw new HttpError(500, "recovery_challenge_verification_failed");
      }
      if (verificationStatus !== "verified") {
        const statusByResult: Record<string, number> = {
          invalid: 400,
          expired: 410,
          locked: 423,
          consumed: 409,
          not_found: 404,
        };
        throw new HttpError(
          statusByResult[String(verificationStatus)] || 400,
          `recovery_${String(verificationStatus || "invalid")}`,
        );
      }

      const { data: factorsData, error: factorsError } =
        await adminClient.auth.admin.mfa.listFactors({
          userId: actor.userId,
        });
      if (factorsError) {
        throw new HttpError(500, "mfa_factors_lookup_failed");
      }

      const crmFactors = (factorsData?.factors || []).filter(
        (factor) =>
          factor.factor_type === "totp" &&
          factor.friendly_name === CRM_MFA_FRIENDLY_NAME,
      );

      for (const factor of crmFactors) {
        const { error: deleteError } =
          await adminClient.auth.admin.mfa.deleteFactor({
            userId: actor.userId,
            id: factor.id,
          });
        if (deleteError) {
          throw new HttpError(500, "crm_mfa_factor_reset_failed");
        }
      }

      const { error: consumeError } = await adminClient
        .from("crm_mfa_recovery_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challengeId)
        .eq("user_id", actor.userId);
      if (consumeError) {
        throw new HttpError(500, "recovery_challenge_close_failed");
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: FUNCTION_NAME,
        action: "confirm_crm_mfa_recovery",
        status: "success",
        targetEntityType: "auth_mfa_factor",
        targetEntityId: actor.userId,
        metadata: {
          rid: log.rid,
          revoked_factor_count: crmFactors.length,
        },
      });

      return jsonResponse(
        {
          ok: true,
          reset: true,
          signOutRequired: true,
        },
        200,
        corsHeaders,
      );
    }

    throw new HttpError(400, "invalid_action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "internal_error";
    const providerMetadata = error instanceof RecoveryEmailProviderError
      ? error.providerMetadata
      : {};

    log.error("request_failed", {
      action,
      status,
      message,
      ...providerMetadata,
    });

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action:
        action === "confirm"
          ? "confirm_crm_mfa_recovery"
          : "request_crm_mfa_recovery",
      status: "failure",
      targetEntityType: "crm_mfa_recovery_challenge",
      targetEntityId: challengeId,
      errorMessage: message,
      metadata: { rid: log.rid, ...providerMetadata },
    });

    return jsonResponse({ error: message, rid: log.rid }, status, corsHeaders);
  }
});