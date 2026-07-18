import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PRODUCTION_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const MANAGEMENT_API_ORIGIN = "https://api.supabase.com";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateInputs(projectRef, accessToken) {
  if (projectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing to modify an unexpected Supabase project.");
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
  let lastStatus = 0;

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
    lastStatus = response.status;
    if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Supabase Management API request failed with HTTP ${response.status}.`);
    }
    await wait(attempt * 1_000);
  }

  throw new Error(`Supabase Management API request failed with HTTP ${lastStatus || "unknown"}.`);
}

async function readLeakedPasswordProtection(url, headers, dependencies) {
  const response = await requestWithRetry(url, { method: "GET", headers }, dependencies);
  let config;
  try {
    config = await response.json();
  } catch (error) {
    throw new Error("Supabase Auth configuration response was not valid JSON.", { cause: error });
  }

  if (typeof config?.password_hibp_enabled !== "boolean") {
    throw new Error("Supabase Auth configuration omitted password_hibp_enabled.");
  }
  return config.password_hibp_enabled;
}

export async function ensureSupabaseAuthSecurity(options = {}) {
  const projectRef = String(options.projectRef || "").trim();
  const accessToken = typeof options.accessToken === "string" ? options.accessToken.trim() : "";
  const dependencies = {
    fetchImpl: options.fetchImpl,
    wait: options.wait,
  };
  validateInputs(projectRef, accessToken);

  const url = `${MANAGEMENT_API_ORIGIN}/v1/projects/${projectRef}/config/auth`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  let enabled = await readLeakedPasswordProtection(url, headers, dependencies);
  const verificationResult = () => {
    const verifiedAt = (options.now ? options.now() : new Date()).toISOString();
    return {
      confirmed: "true",
      evidence: `Supabase Management API verified password_hibp_enabled=true for ${projectRef} at ${verifiedAt}`,
    };
  };

  if (enabled) return verificationResult();

  if (!enabled) {
    await requestWithRetry(url, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password_hibp_enabled: true }),
    }, dependencies);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    enabled = await readLeakedPasswordProtection(url, headers, dependencies);
    if (enabled) {
      return verificationResult();
    }
    if (attempt < MAX_ATTEMPTS) {
      await (dependencies.wait || delay)(attempt * 1_000);
    }
  }

  throw new Error("Supabase password_hibp_enabled is not true after enforcement.");
}

export function writeGithubOutputs(outputPath, result) {
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is unavailable; refusing to emit unverifiable workflow evidence.");
  }
  const evidence = String(result.evidence || "").replace(/[\r\n]/g, " ").trim();
  if (result.confirmed !== "true" || evidence.length < 20) {
    throw new Error("Supabase Auth verification result is incomplete.");
  }
  fs.appendFileSync(outputPath, `confirmed=true\nevidence=${evidence}\n`, "utf8");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = await ensureSupabaseAuthSecurity({
    projectRef: process.env.SUPABASE_PROJECT_REF,
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
  });
  writeGithubOutputs(process.env.GITHUB_OUTPUT, result);
  console.log("Supabase leaked-password protection is enabled and verified for the production project.");
}
