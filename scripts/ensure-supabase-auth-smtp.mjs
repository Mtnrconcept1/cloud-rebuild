import process from "node:process";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "wwcrtyoueexyxkkikaos";
const MANAGEMENT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const EXPECTED_HOST = "smtp.resend.com";
const EXPECTED_PORT = 465;
const EXPECTED_USER = "resend";
const EXPECTED_ADMIN_EMAIL = "noreply@thetok.ch";
const EXPECTED_SENDER_NAME = "TOK";
const EXPECTED_EMAIL_RATE_LIMIT = 100;

function requireSecret(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function managementRequest(method, accessToken, body) {
  const response = await fetch(MANAGEMENT_URL, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `Supabase Auth configuration ${method} failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

export function buildAuthSmtpPatch(resendApiKey) {
  if (!String(resendApiKey || "").trim()) {
    throw new Error("RESEND_API_KEY is required");
  }

  return {
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    smtp_admin_email: EXPECTED_ADMIN_EMAIL,
    smtp_host: EXPECTED_HOST,
    smtp_port: EXPECTED_PORT,
    smtp_user: EXPECTED_USER,
    smtp_pass: resendApiKey,
    smtp_sender_name: EXPECTED_SENDER_NAME,
    rate_limit_email_sent: EXPECTED_EMAIL_RATE_LIMIT,
  };
}

export function assertAuthSmtpConfiguration(config) {
  const failures = [];
  const expected = {
    external_email_enabled: true,
    smtp_admin_email: EXPECTED_ADMIN_EMAIL,
    smtp_host: EXPECTED_HOST,
    smtp_port: EXPECTED_PORT,
    smtp_user: EXPECTED_USER,
    smtp_sender_name: EXPECTED_SENDER_NAME,
    rate_limit_email_sent: EXPECTED_EMAIL_RATE_LIMIT,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (config?.[key] !== value) {
      failures.push(`${key}=${JSON.stringify(config?.[key])}, expected ${JSON.stringify(value)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Supabase Auth SMTP verification failed: ${failures.join("; ")}`);
  }
}

export async function ensureSupabaseAuthSmtp() {
  const accessToken = requireSecret("SUPABASE_ACCESS_TOKEN");
  const resendApiKey = requireSecret("RESEND_API_KEY");
  const patch = buildAuthSmtpPatch(resendApiKey);

  await managementRequest("PATCH", accessToken, patch);
  const config = await managementRequest("GET", accessToken);
  assertAuthSmtpConfiguration(config);

  console.log(
    `Supabase Auth SMTP verified for ${PROJECT_REF}: ${EXPECTED_HOST}:${EXPECTED_PORT}, sender ${EXPECTED_ADMIN_EMAIL}, email rate limit ${EXPECTED_EMAIL_RATE_LIMIT}/h.`,
  );
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  await ensureSupabaseAuthSmtp();
}
