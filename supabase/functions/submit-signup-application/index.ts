import { HttpError, authenticateRequest, createAdminClient, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { getEffectiveFeatureFlagSet } from "../_shared/feature-flags.ts";
import { isFairGrowthAnnualBillingEnabled } from "../_shared/restaurant-subscription-billing.ts";
import {
  ACCEPTED_MIME_TYPES,
  LEGAL_ACCEPTANCE_VERSION,
  MAX_DOCUMENT_BYTES,
  getRequiredDocumentTypes,
  validateSubmissionFields,
} from "./validation.ts";

const FUNCTION_NAME = "submit-signup-application";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeText(raw: FormDataEntryValue | null, max = 1000) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function requireInput(condition: unknown, message: string): asserts condition {
  if (!condition) throw new HttpError(400, message);
}

function getClientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isProductionRuntime() {
  const environment = [
    Deno.env.get("ENVIRONMENT"),
    Deno.env.get("APP_ENV"),
    Deno.env.get("NODE_ENV"),
  ].join(" ").toLowerCase();
  const publicUrls = [
    Deno.env.get("APP_BASE_URL"),
    Deno.env.get("PUBLIC_APP_URL"),
    Deno.env.get("SITE_URL"),
  ].join(" ").toLowerCase();

  return environment.includes("production") ||
    publicUrls.includes("thetok.ch") ||
    publicUrls.includes("cloud-rebuild-recovered.vercel.app");
}

async function verifyTurnstileIfConfigured(token: string, req: Request) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() ||
    Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY")?.trim() ||
    "";

  if (!secret) {
    if (isProductionRuntime()) throw new HttpError(503, "captcha_not_configured");
    return { skipped: true };
  }

  requireInput(token, "captcha_required");

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);

  const ip = getClientIp(req);
  if (ip !== "unknown") form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new HttpError(502, "captcha_verification_failed");

  const payload = await response.json().catch(() => ({}));
  if (payload?.success !== true) throw new HttpError(400, "captcha_invalid");
  return { skipped: false };
}

function safeFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  if (["pdf", "png", "jpg", "jpeg", "webp", "heic", "heif"].includes(fromName)) return fromName;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "";
}

function mimeTypeForDocument(file: File) {
  const declaredType = file.type.trim().toLowerCase();
  if (ACCEPTED_MIME_TYPES.includes(declaredType)) return declaredType;

  const extension = safeFileExtension(file);
  const inferredMimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };

  return inferredMimeTypes[extension] || declaredType;
}

function fileNameForStorage(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "document";
}

async function uploadDocument(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  userId: string;
  role: string;
  documentType: string;
  file: File;
}) {
  const mimeType = mimeTypeForDocument(input.file);
  requireInput(ACCEPTED_MIME_TYPES.includes(mimeType), `invalid_document_type:${input.documentType}`);
  requireInput(input.file.size > 0, `empty_document:${input.documentType}`);
  requireInput(input.file.size <= MAX_DOCUMENT_BYTES, `document_too_large:${input.documentType}`);

  const extension = safeFileExtension(input.file);
  const path = [
    input.userId,
    fileNameForStorage(input.role),
    `${fileNameForStorage(input.documentType)}-${crypto.randomUUID()}.${extension}`,
  ].join("/");

  const { error } = await input.adminClient.storage
    .from("verification-documents")
    .upload(path, input.file, {
      contentType: mimeType || undefined,
      cacheControl: "3600",
      upsert: true,
    });

  if (error) throw new HttpError(500, error.message);

  return {
    document_type: input.documentType,
    file_path: path,
    file_name: input.file.name,
    mime_type: mimeType || null,
    file_size_bytes: input.file.size,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  const adminClient = createAdminClient();
  let targetEntityId: string | null = null;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    actor = await authenticateRequest(req, { allowServiceRole: false });

    const contentType = req.headers.get("content-type") || "";
    requireInput(contentType.toLowerCase().includes("multipart/form-data"), "multipart_form_data_required");

    const form = await req.formData();
    const userId = sanitizeText(form.get("user_id"), 80);
    const role = sanitizeText(form.get("requested_role"), 40).toLowerCase();
    const email = sanitizeText(form.get("email"), 180).toLowerCase();
    const fields = {
      full_name: sanitizeText(form.get("full_name"), 180),
      phone: sanitizeText(form.get("phone"), 80),
      city: sanitizeText(form.get("city"), 120),
      address: sanitizeText(form.get("address"), 240),
      legal_name: sanitizeText(form.get("legal_name"), 180),
      business_name: sanitizeText(form.get("business_name"), 180),
      business_registration_number: sanitizeText(form.get("business_registration_number"), 120),
      tax_id: sanitizeText(form.get("tax_id"), 120),
      restaurant_name: sanitizeText(form.get("restaurant_name"), 180),
      restaurant_description: sanitizeText(form.get("restaurant_description"), 1500),
      vehicle_type: sanitizeText(form.get("vehicle_type"), 60),
      license_plate: sanitizeText(form.get("license_plate"), 60),
      iban: sanitizeText(form.get("iban"), 80),
      subscription_plan_id: sanitizeText(form.get("subscription_plan_id"), 80),
      subscription_billing_period: sanitizeText(form.get("subscription_billing_period"), 20).toLowerCase(),
      commercial_referral_token: sanitizeText(form.get("commercial_referral_token"), 80).toLowerCase(),
      terms_accepted: sanitizeText(form.get("terms_accepted"), 20).toLowerCase(),
      privacy_policy_accepted: sanitizeText(form.get("privacy_policy_accepted"), 20).toLowerCase(),
      legal_acceptance_version: sanitizeText(form.get("legal_acceptance_version"), 40),
      legal_acceptance_at: sanitizeText(form.get("legal_acceptance_at"), 80),
      contract_version: sanitizeText(form.get("contract_version"), 80),
      contract_title: sanitizeText(form.get("contract_title"), 180),
      contract_signer_name: sanitizeText(form.get("contract_signer_name"), 180),
      contract_signature_data_url: sanitizeText(form.get("contract_signature_data_url"), 50000),
    };

    requireInput(UUID_PATTERN.test(userId), "invalid_user_id");
    requireInput(actor.userId === userId, "user_id_mismatch");
    if (email) requireInput(EMAIL_PATTERN.test(email), "invalid_email");
    if (fields.commercial_referral_token) {
      requireInput(role === "restaurateur", "commercial_referral_restaurateur_only");
      requireInput(UUID_PATTERN.test(fields.commercial_referral_token), "invalid_commercial_referral_token");
    }
    const validationError = validateSubmissionFields(role, fields);
    if (validationError) throw new HttpError(400, validationError);
    if (role === "restaurateur" && fields.subscription_billing_period === "yearly") {
      const activeFlags = await getEffectiveFeatureFlagSet(adminClient);
      if (!isFairGrowthAnnualBillingEnabled(activeFlags)) {
        throw new HttpError(503, "La facturation annuelle Fair Growth n'est pas encore activee.");
      }
    }

    const captcha = await verifyTurnstileIfConfigured(sanitizeText(form.get("captcha_token"), 1200), req);
    const limiter = createRateLimiter(adminClient, FUNCTION_NAME);
    await limiter.consume(`ip:${getClientIp(req)}`, { maxRequests: 8, windowSeconds: 600 });
    await limiter.consume(`user:${userId}`, { maxRequests: 3, windowSeconds: 900 });
    await limiter.consume("global", { maxRequests: 60, windowSeconds: 60 });

    const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(userId);
    if (authUserError || !authUser?.user) throw new HttpError(404, "auth_user_not_found");
    if (email && authUser.user.email?.toLowerCase() !== email) throw new HttpError(403, "email_user_mismatch");

    const requiredDocumentTypes = getRequiredDocumentTypes(role, fields.vehicle_type);
    const uploadedDocuments = [];
    for (const documentType of requiredDocumentTypes) {
      const value = form.get(`document_${documentType}`);
      requireInput(value instanceof File, `missing_document:${documentType}`);
      uploadedDocuments.push(await uploadDocument({ adminClient, userId, role, documentType, file: value }));
    }

    const legalAcceptedAt = fields.legal_acceptance_at || new Date().toISOString();
    const legalMetadata = {
      legal_terms_accepted: true,
      privacy_policy_accepted: true,
      legal_terms_accepted_at: legalAcceptedAt,
      privacy_policy_accepted_at: legalAcceptedAt,
      legal_acceptance_version: fields.legal_acceptance_version || LEGAL_ACCEPTANCE_VERSION,
      legal_acceptance_source: "auth_signup_edge",
    };

    const metadata = role === "courier"
      ? {
        first_name: fields.full_name.split(/\s+/)[0] || "",
        last_name: fields.full_name.split(/\s+/).slice(1).join(" "),
        onboarding_source: "auth_signup_edge",
        ...legalMetadata,
      }
      : {
        onboarding_source: "auth_signup_edge",
        selected_subscription_plan_id: fields.subscription_plan_id,
        selected_subscription_billing_period: fields.subscription_billing_period,
        ...(fields.commercial_referral_token
          ? { commercial_referral_token: fields.commercial_referral_token }
          : {}),
        onboarding_payment_status: "payment_method_required",
        contract_version: fields.contract_version,
        contract_title: fields.contract_title || "Contrat de partenariat restaurateur TOK",
        contract_signer_name: fields.contract_signer_name,
        contract_signature_data_url: fields.contract_signature_data_url,
        contract_signed_at: legalAcceptedAt,
        contract_signature_source: "auth_signup_edge",
        ...legalMetadata,
      };

    const { data: applicationRows, error: rpcError } = await adminClient.rpc("admin_submit_signup_application", {
      p_user_id: userId,
      p_requested_role: role,
      p_full_name: fields.full_name,
      p_phone: fields.phone,
      p_city: fields.city,
      p_address: fields.address,
      p_legal_name: role === "restaurateur" ? fields.legal_name : null,
      p_business_name: role === "restaurateur" ? fields.business_name : null,
      p_business_registration_number: role === "restaurateur" ? fields.business_registration_number : null,
      p_tax_id: role === "restaurateur" ? fields.tax_id : null,
      p_restaurant_name: role === "restaurateur" ? fields.restaurant_name : null,
      p_restaurant_description: role === "restaurateur" ? fields.restaurant_description : null,
      p_vehicle_type: role === "courier" ? fields.vehicle_type : null,
      p_license_plate: role === "courier" ? fields.license_plate : null,
      p_iban: fields.iban,
      p_metadata: metadata,
      p_documents: uploadedDocuments,
    });

    if (rpcError) throw new HttpError(500, rpcError.message);

    const firstRow = Array.isArray(applicationRows) ? applicationRows[0] : applicationRows;
    targetEntityId = firstRow?.application_id || null;
    await writeAuditLog({
      adminClient,
      functionName: FUNCTION_NAME,
      action: "submit_privileged_signup_draft",
      status: "success",
      actor,
      request: req,
      targetEntityType: "signup_applications",
      targetEntityId,
      metadata: {
        role,
        user_id: userId,
        documents_count: uploadedDocuments.length,
        captcha_skipped: captcha.skipped,
        contract_signed: role === "restaurateur" && Boolean(fields.contract_signature_data_url),
      },
    });

    log.info("privileged signup draft stored", { role, user_id: userId, targetEntityId });
    return jsonResponse({ ok: true, application: firstRow || null }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "internal_error";
    log.error("privileged signup draft failed", { status, message, targetEntityId });
    await writeAuditLog({
      adminClient,
      functionName: FUNCTION_NAME,
      action: "submit_privileged_signup_draft",
      status: "failure",
      actor,
      request: req,
      targetEntityType: "signup_applications",
      targetEntityId,
      errorMessage: message,
    });
    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
