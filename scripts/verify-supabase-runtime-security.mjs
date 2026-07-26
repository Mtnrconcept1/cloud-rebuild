import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PRODUCTION_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const MANAGEMENT_API_ORIGIN = "https://api.supabase.com";
const RESEND_API_ORIGIN = "https://api.resend.com";
const DEFAULT_EMAIL_FROM = "Tok <noreply@thetok.ch>";
const RESEND_TEST_RECIPIENT = "delivered+tok-production-preflight@resend.dev";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const PROVIDER_ERROR_CODE_PATTERN = /^[a-z0-9_-]{1,64}$/i;

const CRON_CONFIGURATION_QUERY = `
select
  exists (
    select 1
    from vault.decrypted_secrets
    where name = 'internal_cron_secret'
      and nullif(decrypted_secret, '') is not null
      and length(decrypted_secret) >= 16
  ) as internal_cron_secret_ready,
  to_regprocedure('public.verify_internal_cron_secret(text)') is not null as verifier_ready;
`.trim();

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateInputs(projectRef, accessToken) {
  if (projectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing to inspect an unexpected Supabase project.");
  }
  if (typeof accessToken !== "string" || accessToken.trim().length < 20) {
    throw new Error("SUPABASE_ACCESS_TOKEN is missing or invalid.");
  }
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

async function requestWithRetry(url, options, dependencies) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const wait = dependencies.wait || delay;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error("Supabase Management API request failed after bounded retries.", { cause: error });
      }
      await wait(attempt * 1_000);
      continue;
    }

    if (response.ok) return response;
    if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Supabase Management API request failed with HTTP ${response.status}.`);
    }
    await wait(attempt * 1_000);
  }

  throw new Error("Supabase Management API request failed.");
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} response was not valid JSON.`, { cause: error });
  }
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function isProviderBootstrapGraceActive(graceUntil, now) {
  const rawUntil = typeof graceUntil === "string" ? graceUntil.trim() : "";
  const until = Date.parse(rawUntil);
  return rawUntil.length > 0
    && Number.isFinite(until)
    && now instanceof Date
    && Number.isFinite(now.getTime())
    && now.getTime() < until;
}

function secretNamesFromPayload(payload) {
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.secrets)
      ? payload.secrets
      : Array.isArray(payload?.result)
        ? payload.result
        : [];

  return new Set(
    entries
      .map((entry) => typeof entry?.name === "string" ? entry.name.trim() : "")
      .filter(Boolean),
  );
}

function normalizeEmailFrom(rawValue) {
  const value = typeof rawValue === "string" && rawValue.trim()
    ? rawValue.trim()
    : DEFAULT_EMAIL_FROM;
  const bracketMatch = value.match(/<([^<>]+)>/);
  const address = (bracketMatch?.[1] || value).trim().toLowerCase();
  const atIndex = address.lastIndexOf("@");
  const domain = atIndex > 0 ? address.slice(atIndex + 1) : "";

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
    || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)
  ) {
    throw new Error("EMAIL_FROM must contain a valid production sender address.");
  }

  return { value, address, domain };
}

function normalizeProviderErrorCode(value) {
  return typeof value === "string" && PROVIDER_ERROR_CODE_PATTERN.test(value)
    ? value
    : null;
}

async function readProviderErrorCode(response) {
  try {
    const payload = await response.json();
    return normalizeProviderErrorCode(payload?.name);
  } catch {
    return null;
  }
}

function buildResendIdempotencyKey(projectRef, emailFrom, now) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const senderDigest = createHash("sha256")
    .update(emailFrom)
    .digest("hex")
    .slice(0, 12);
  return `tok-production-preflight-${projectRef}-${date}-${senderDigest}`;
}

async function verifyResendSender(options, dependencies) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const wait = dependencies.wait || delay;
  const sender = normalizeEmailFrom(options.emailFrom);
  const idempotencyKey = buildResendIdempotencyKey(
    options.projectRef,
    sender.value,
    options.now,
  );

  const request = {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${options.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "User-Agent": "TOK-Production-Preflight/1.0",
    },
    body: JSON.stringify({
      from: sender.value,
      to: [RESEND_TEST_RECIPIENT],
      subject: "TOK production email provider preflight",
      text: "Automated sender-domain readiness check. No user action is required.",
    }),
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${RESEND_API_ORIGIN}/emails`, {
        ...request,
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error("Resend sender verification failed after bounded retries.", { cause: error });
      }
      await wait(attempt * 1_000);
      continue;
    }

    if (response.ok) {
      return {
        senderDomain: sender.domain,
        providerStatus: response.status,
      };
    }

    if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
      await wait(attempt * 1_000);
      continue;
    }

    const providerErrorCode = await readProviderErrorCode(response);
    const codeSuffix = providerErrorCode ? ` (${providerErrorCode})` : "";

    if (response.status === 403 && providerErrorCode === "validation_error") {
      throw new Error(
        `Resend rejected EMAIL_FROM for ${sender.domain} with HTTP 403${codeSuffix}. Verify the sender domain DNS before deployment.`,
      );
    }

    throw new Error(
      `Resend production sender verification failed with HTTP ${response.status}${codeSuffix}.`,
    );
  }

  throw new Error("Resend production sender verification failed.");
}

export async function verifySupabaseRuntimeSecurity(options = {}) {
  const projectRef = String(options.projectRef || "").trim();
  const accessToken = typeof options.accessToken === "string" ? options.accessToken.trim() : "";
  const dependencies = {
    fetchImpl: options.fetchImpl,
    wait: options.wait,
  };
  validateInputs(projectRef, accessToken);

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  const queryUrl = `${MANAGEMENT_API_ORIGIN}/v1/projects/${projectRef}/database/query`;
  const queryResponse = await requestWithRetry(queryUrl, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: CRON_CONFIGURATION_QUERY }),
  }, dependencies);
  const queryPayload = await readJson(queryResponse, "Supabase database query");
  const [runtimeRow] = rowsFromPayload(queryPayload);

  if (runtimeRow?.internal_cron_secret_ready !== true || runtimeRow?.verifier_ready !== true) {
    throw new Error("Supabase Vault internal cron authentication is not fully configured.");
  }

  const secretsUrl = `${MANAGEMENT_API_ORIGIN}/v1/projects/${projectRef}/secrets`;
  const secretsResponse = await requestWithRetry(
    secretsUrl,
    { method: "GET", headers },
    dependencies,
  );
  const secretsPayload = await readJson(secretsResponse, "Supabase Edge secrets");
  const secretNames = secretNamesFromPayload(secretsPayload);
  const configuredResendApiKey = typeof options.resendApiKey === "string"
    ? options.resendApiKey.trim()
    : "";
  const providerHasResend = secretNames.has("RESEND_API_KEY");
  const pendingResendSync = /^re_[A-Za-z0-9_\-]+$/.test(configuredResendApiKey)
    && configuredResendApiKey.length >= 12;

  const now = options.now ? options.now() : new Date();
  const graceActive = isProviderBootstrapGraceActive(
    options.providerBootstrapGraceUntil,
    now,
  );

  const requestedEmailFrom = typeof options.emailFrom === "string"
    ? options.emailFrom.trim()
    : "";
  const verifiedAt = now.toISOString();

  if (!providerHasResend && !pendingResendSync) {
    if (graceActive) {
      return {
        cronConfirmed: "true",
        cronEvidence: `Supabase Management API verified Vault cron secret and verifier with a read-only SELECT for ${projectRef} at ${verifiedAt}`,
        resendConfirmed: "grace",
        resendEvidence: `Temporary provider bootstrap grace permits absent RESEND_API_KEY until ${String(options.providerBootstrapGraceUntil).trim()}; email remains unavailable at ${verifiedAt}`,
      };
    }

    throw new Error(
      "Supabase production does not include RESEND_API_KEY and no valid GitHub secret is available for synchronization.",
    );
  }

  if (requestedEmailFrom) {
    if (!pendingResendSync) {
      throw new Error(
        "Supabase contains RESEND_API_KEY, but GitHub RESEND_API_KEY is unavailable for a live sender-domain test. Production deployment is blocked.",
      );
    }

    const resendVerification = await verifyResendSender({
      projectRef,
      resendApiKey: configuredResendApiKey,
      emailFrom: requestedEmailFrom,
      now,
    }, dependencies);

    return {
      cronConfirmed: "true",
      cronEvidence: `Supabase Management API verified Vault cron secret and verifier with a read-only SELECT for ${projectRef} at ${verifiedAt}`,
      resendConfirmed: "true",
      resendEvidence: providerHasResend
        ? `Supabase contains RESEND_API_KEY and Resend accepted a controlled delivery test from ${resendVerification.senderDomain} at ${verifiedAt}`
        : `GitHub Actions validated RESEND_API_KEY with a controlled delivery test from ${resendVerification.senderDomain} before synchronization to ${projectRef} at ${verifiedAt}`,
    };
  }

  return {
    cronConfirmed: "true",
    cronEvidence: `Supabase Management API verified Vault cron secret and verifier with a read-only SELECT for ${projectRef} at ${verifiedAt}`,
    resendConfirmed: providerHasResend || pendingResendSync ? "true" : "grace",
    resendEvidence: providerHasResend
      ? `Supabase Management API verified RESEND_API_KEY presence for ${projectRef} at ${verifiedAt}`
      : pendingResendSync
        ? `GitHub Actions validated RESEND_API_KEY for provider synchronization to ${projectRef} at ${verifiedAt}`
        : `Temporary provider bootstrap grace permits absent RESEND_API_KEY until ${String(options.providerBootstrapGraceUntil).trim()}; email remains unavailable at ${verifiedAt}`,
  };
}

export function writeGithubOutputs(outputPath, result) {
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is unavailable; refusing to emit unverifiable workflow evidence.");
  }

  const cronEvidence = String(result.cronEvidence || "").replace(/[\r\n]/g, " ").trim();
  const resendEvidence = String(result.resendEvidence || "").replace(/[\r\n]/g, " ").trim();
  if (
    result.cronConfirmed !== "true"
    || !["true", "grace"].includes(result.resendConfirmed)
    || cronEvidence.length < 20
    || resendEvidence.length < 20
  ) {
    throw new Error("Supabase runtime verification result is incomplete.");
  }

  fs.appendFileSync(
    outputPath,
    [
      "cron_confirmed=true",
      `cron_evidence=${cronEvidence}`,
      `resend_confirmed=${result.resendConfirmed}`,
      `resend_evidence=${resendEvidence}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = await verifySupabaseRuntimeSecurity({
    projectRef: process.env.SUPABASE_PROJECT_REF,
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    providerBootstrapGraceUntil: process.env.PROVIDER_BOOTSTRAP_GRACE_UNTIL,
  });
  writeGithubOutputs(process.env.GITHUB_OUTPUT, result);
  console.log("Supabase Vault cron authentication and live Resend sender readiness are verified.");
}
