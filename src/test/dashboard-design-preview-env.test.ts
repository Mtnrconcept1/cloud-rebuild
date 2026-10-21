import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "dotenv";
import { afterEach, describe, expect, it } from "vitest";
import { OFFICIAL_SUPABASE_PROJECT_ID, OFFICIAL_SUPABASE_URL, preparePreviewPublicConfig, resolvePreviewPublicConfig } from "../../scripts/dashboard-design-preview-env.mjs";

const publishable = `sb_publishable_${"p".repeat(32)}`;
const fallbackPublishable = `sb_publishable_${"f".repeat(32)}`;
const jwt = (role = "anon", ref = OFFICIAL_SUPABASE_PROJECT_ID) => [
  { alg: "HS256", typ: "JWT" }, { role, ref },
].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).concat("fictional_signature").join(".");
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

describe("temporary preview public configuration", () => {
  it("prefers a complete Preview pair over the official fallback", () => {
    const resolved = resolvePreviewPublicConfig({ VITE_SUPABASE_URL: OFFICIAL_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: publishable }, { publishableKey: fallbackPublishable });
    expect(resolved.source).toBe("preview");
    expect(resolved.values.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(publishable);
  });

  it.each([{}, { VITE_SUPABASE_URL: OFFICIAL_SUPABASE_URL }, { VITE_SUPABASE_PUBLISHABLE_KEY: publishable }])("uses the entire official fallback when Preview is incomplete (%j)", (preview) => {
    const resolved = resolvePreviewPublicConfig(preview, { anonKey: jwt() });
    expect(resolved.source).toBe("official-fallback");
    expect(resolved.values).toEqual({ VITE_SUPABASE_PROJECT_ID: OFFICIAL_SUPABASE_PROJECT_ID, VITE_SUPABASE_URL: OFFICIAL_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: jwt(), VITE_SUPABASE_ANON_KEY: jwt() });
  });

  it("accepts the existing legacy anon JWT for the same project", () => {
    expect(resolvePreviewPublicConfig({ VITE_SUPABASE_URL: OFFICIAL_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: jwt() }).source).toBe("preview");
  });

  it.each([{}, { VITE_SUPABASE_URL: OFFICIAL_SUPABASE_URL }, { VITE_SUPABASE_PUBLISHABLE_KEY: publishable }])("rejects incomplete Preview without a complete fallback (%j)", preview => {
    expect(() => resolvePreviewPublicConfig(preview)).toThrow("Missing complete public");
  });

  it.each([
    { VITE_SUPABASE_PROJECT_ID: "other-project" },
    { VITE_SUPABASE_URL: "https://another-project.supabase.co" },
    { VITE_SUPABASE_URL: `${OFFICIAL_SUPABASE_URL}/unrelated` },
    { VITE_SUPABASE_URL: `${OFFICIAL_SUPABASE_URL}?key=private-input` },
    { VITE_SUPABASE_URL: "https://invalid host/private-input" },
  ])("rejects a contradictory Preview target before considering fallback (%j)", preview => {
    expect(() => resolvePreviewPublicConfig(preview, { publishableKey: fallbackPublishable })).toThrow(/Supabase (?:URL|project)/);
  });

  it.each([
    `sb_secret_${"s".repeat(32)}`, "ci-public-placeholder", `sb_publishable_placeholder_${"p".repeat(32)}`,
    jwt("service_role"), jwt("authenticated"), jwt("anon", "another-project"), "malformed.jwt.payload",
  ])("rejects non-public or mismatched keys without exposing their values", key => {
    for (const resolve of [
      () => resolvePreviewPublicConfig({}, { publishableKey: key }),
      () => resolvePreviewPublicConfig({ VITE_SUPABASE_URL: OFFICIAL_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: publishable, VITE_SUPABASE_ANON_KEY: key }),
    ]) {
      let message = "";
      try { resolve(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
      expect(message).toMatch(/valid public Supabase key/);
      expect(message).not.toContain(key);
    }
  });

  it("appends only normalized public fields to the temporary preview file after the project gate", () => {
    const root = mkdtempSync(path.join(tmpdir(), "tok-preview-public-"));
    directories.push(root);
    mkdirSync(path.join(root, ".vercel"));
    const projectFile = path.join(root, ".vercel/project.json");
    const previewFile = path.join(root, ".vercel/.env.preview.local");
    writeFileSync(projectFile, JSON.stringify({ orgId: "team_FvFPXdOD5Vw9DAQS5grAuJAv", projectId: "unexpected" }));
    writeFileSync(previewFile, "EXISTING_SETTING=unchanged\n");
    const fallback = { DASHBOARD_PREVIEW_FALLBACK_PUBLISHABLE_KEY: publishable };
    expect(() => preparePreviewPublicConfig(root, fallback)).toThrow("unexpected Vercel project");
    expect(readFileSync(previewFile, "utf8")).toBe("EXISTING_SETTING=unchanged\n");
    writeFileSync(projectFile, JSON.stringify({ orgId: "team_FvFPXdOD5Vw9DAQS5grAuJAv", projectId: "prj_v4X2Bhefbcf12CVIanrvS62q9Vy6" }));
    expect(preparePreviewPublicConfig(root, fallback)).toBe("official-fallback");
    expect(parse(readFileSync(previewFile))).toEqual({ EXISTING_SETTING: "unchanged", ...resolvePreviewPublicConfig({}, { publishableKey: publishable }).values });
  });
});
