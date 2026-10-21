import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

// Same public frontend target and existing credentials as deploy-production.yml.
// This helper only appends public fields to the temporary local preview file.
export const OFFICIAL_SUPABASE_PROJECT_ID = "wwcrtyoueexyxkkikaos";
export const OFFICIAL_SUPABASE_URL = `https://${OFFICIAL_SUPABASE_PROJECT_ID}.supabase.co`;
const VERCEL_ORG_ID = "team_FvFPXdOD5Vw9DAQS5grAuJAv";
const VERCEL_PROJECT_ID = "prj_v4X2Bhefbcf12CVIanrvS62q9Vy6";
const clean = (value) => typeof value === "string" ? value.trim() : "";

function assertPublicKey(key) {
  const invalid = () => new Error("The preview requires a valid public Supabase key for the official project.");
  if (/placeholder|example|replace[_-]?(?:me|with)|your[_-]?key/i.test(key)) throw invalid();
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return;
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw invalid();
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!header || !["HS256", "RS256", "ES256"].includes(header.alg) || !payload ||
      payload.role !== "anon" || payload.ref !== OFFICIAL_SUPABASE_PROJECT_ID) throw invalid();
}

function assertPreviewTarget(preview) {
  const projectId = clean(preview.VITE_SUPABASE_PROJECT_ID);
  const rawUrl = clean(preview.VITE_SUPABASE_URL);
  if (projectId && projectId !== OFFICIAL_SUPABASE_PROJECT_ID) {
    throw new Error("The Preview Supabase project does not match the official frontend target.");
  }
  if (!rawUrl) return;
  let url;
  try { url = new URL(rawUrl); } catch {
    throw new Error("The Preview Supabase URL is invalid.");
  }
  if (url.origin !== OFFICIAL_SUPABASE_URL || url.username || url.password ||
      !["", "/"].includes(url.pathname) || url.search || url.hash) {
    throw new Error("The Preview Supabase URL does not match the official frontend target.");
  }
}

function publicKeyPair(publishable, anon) {
  const keys = [clean(publishable), clean(anon)];
  keys.filter(Boolean).forEach(assertPublicKey);
  return keys[0] || keys[1];
}

export function resolvePreviewPublicConfig(preview, fallback = {}) {
  // Validate every existing field, including the unused key alias, before any
  // fallback. A contradictory or non-public Preview value must fail closed.
  assertPreviewTarget(preview);
  const previewKey = publicKeyPair(preview.VITE_SUPABASE_PUBLISHABLE_KEY, preview.VITE_SUPABASE_ANON_KEY);
  const completePreview = Boolean(clean(preview.VITE_SUPABASE_URL) && previewKey);
  const key = completePreview ? previewKey : publicKeyPair(fallback.publishableKey, fallback.anonKey);
  if (!key) throw new Error("Missing complete public Supabase configuration for the preview.");
  return {
    source: completePreview ? "preview" : "official-fallback",
    values: {
      VITE_SUPABASE_PROJECT_ID: OFFICIAL_SUPABASE_PROJECT_ID,
      VITE_SUPABASE_URL: OFFICIAL_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      VITE_SUPABASE_ANON_KEY: key,
    },
  };
}

export function preparePreviewPublicConfig(root, environment = process.env) {
  let project;
  try { project = JSON.parse(fs.readFileSync(path.join(root, ".vercel/project.json"), "utf8")); } catch {
    throw new Error("Cannot verify the existing Vercel preview project.");
  }
  if (project.orgId !== VERCEL_ORG_ID || project.projectId !== VERCEL_PROJECT_ID) {
    throw new Error("Refusing to prepare public configuration for an unexpected Vercel project.");
  }
  const file = path.join(root, ".vercel/.env.preview.local");
  const preview = parse(fs.readFileSync(file, "utf8"));
  const resolved = resolvePreviewPublicConfig(preview, {
    publishableKey: environment.DASHBOARD_PREVIEW_FALLBACK_PUBLISHABLE_KEY,
    anonKey: environment.DASHBOARD_PREVIEW_FALLBACK_ANON_KEY,
  });
  fs.appendFileSync(file, `\n# Validated public frontend configuration for this preview build only.\n${Object.entries(resolved.values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n")}\n`);
  return resolved.source;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const source = preparePreviewPublicConfig(process.cwd());
    console.log(`Prepared ${source === "preview" ? "existing Preview" : "existing official public frontend"} configuration for this preview build; values remain private.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Preview public configuration preparation failed.");
    process.exitCode = 1;
  }
}
