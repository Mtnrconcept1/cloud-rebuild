import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAppleAppSiteAssociation,
  writeAppleAppSiteAssociation,
} from "../../scripts/write-apple-app-site-association.mjs";
import { ensureSupabaseAuthSecurity } from "../../scripts/ensure-supabase-auth-security.mjs";

const PRODUCTION_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const fixtures: string[] = [];

function fixture(name: string) {
  const root = path.join(process.cwd(), ".tmp", `production-preflight-${name}-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  fixtures.push(root);
  return root;
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("production preflight hardening", () => {
  it("generates an atomic Apple association for the exact TOK bundle", () => {
    const root = fixture("aasa");
    const result = writeAppleAppSiteAssociation({ root, teamId: "TEAM123456" });
    const stored = JSON.parse(readFileSync(result.outputPath, "utf8"));

    expect(stored).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appIDs: ["TEAM123456.com.tok.app"],
            components: [{ "/": "/*", comment: "TOK Universal Links" }],
          },
        ],
      },
    });
  });

  it("rejects missing team IDs and unexpected bundle identifiers", () => {
    expect(() => buildAppleAppSiteAssociation({ teamId: "" })).toThrow("APPLE_TEAM_ID");
    expect(() => buildAppleAppSiteAssociation({ teamId: "TOO-SHORT" })).toThrow("APPLE_TEAM_ID");
    expect(() => buildAppleAppSiteAssociation({
      teamId: "TEAM123456",
      bundleId: "com.example.app",
    })).toThrow("unexpected bundle ID");
  });

  it("keeps the Apple association output inside the repository", () => {
    const root = fixture("aasa-output-boundary");

    expect(() => writeAppleAppSiteAssociation({
      root,
      teamId: "TEAM123456",
      output: "../outside/apple-app-site-association",
    })).toThrow("inside the repository");
    expect(() => writeAppleAppSiteAssociation({
      root,
      teamId: "TEAM123456",
      output: path.resolve(root, "absolute/apple-app-site-association"),
    })).toThrow("repository-relative");
  });

  it("does not mutate Supabase when leaked-password protection is already active", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ password_hibp_enabled: true, smtp_pass: "must-never-be-logged" });
    });

    const result = await ensureSupabaseAuthSecurity({
      projectRef: PRODUCTION_PROJECT_REF,
      accessToken: "sbp_test_token_that_is_long_enough",
      fetchImpl,
      wait: async () => undefined,
      now: () => new Date("2026-07-18T21:00:00.000Z"),
    });

    expect(result.confirmed).toBe("true");
    expect(calls.map((call) => call.init.method)).toEqual(["GET"]);
    expect(calls[0].url).toBe(
      `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/config/auth`,
    );
  });

  it("patches only password_hibp_enabled and verifies the live result", async () => {
    const calls: Array<{ init: RequestInit }> = [];
    const responses = [
      jsonResponse({ password_hibp_enabled: false, smtp_pass: "must-never-be-logged" }),
      new Response(null, { status: 200 }),
      jsonResponse({ password_hibp_enabled: true, smtp_pass: "must-never-be-logged" }),
    ];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ init });
      return responses.shift() as Response;
    });

    await expect(ensureSupabaseAuthSecurity({
      projectRef: PRODUCTION_PROJECT_REF,
      accessToken: "sbp_test_token_that_is_long_enough",
      fetchImpl,
      wait: async () => undefined,
      now: () => new Date("2026-07-18T21:00:00.000Z"),
    })).resolves.toMatchObject({ confirmed: "true" });

    expect(calls.map((call) => call.init.method)).toEqual(["GET", "PATCH", "GET"]);
    expect(calls[1].init.body).toBe('{"password_hibp_enabled":true}');
  });

  it("fails closed without leaking the access token or sensitive response fields", async () => {
    const token = "sbp_super_secret_token_that_must_not_leak";
    const fetchImpl = vi.fn(async () => jsonResponse({
      password_hibp_enabled: false,
      smtp_pass: "smtp-secret-that-must-not-leak",
    }, 403));

    let message = "";
    try {
      await ensureSupabaseAuthSecurity({
        projectRef: PRODUCTION_PROJECT_REF,
        accessToken: token,
        fetchImpl,
        wait: async () => undefined,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("HTTP 403");
    expect(message).not.toContain(token);
    expect(message).not.toContain("smtp-secret");
  });

  it("fails closed when Supabase remains disabled after the PATCH", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "PATCH") return new Response(null, { status: 200 });
      return jsonResponse({ password_hibp_enabled: false });
    });

    await expect(ensureSupabaseAuthSecurity({
      projectRef: PRODUCTION_PROJECT_REF,
      accessToken: "sbp_test_token_that_is_long_enough",
      fetchImpl,
      wait: async () => undefined,
    })).rejects.toThrow("is not true after enforcement");
  });

  it("refuses every Supabase project other than the pinned production ref", async () => {
    const fetchImpl = vi.fn();
    await expect(ensureSupabaseAuthSecurity({
      projectRef: "ssllswowblnvisalaaka",
      accessToken: "sbp_test_token_that_is_long_enough",
      fetchImpl,
      wait: async () => undefined,
    })).rejects.toThrow("unexpected Supabase project");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pins the workflow to live Supabase evidence and builds only after preflight", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
      "utf8",
    );
    const vercel = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    expect(workflow).toContain("id: supabase_auth_security");
    expect(workflow).toContain("node ./scripts/ensure-supabase-auth-security.mjs");
    expect(workflow).toContain("steps.supabase_auth_security.outputs.confirmed");
    expect(workflow).toContain("steps.supabase_auth_security.outputs.evidence");
    expect(workflow).not.toContain("vars.SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED");
    expect(workflow).not.toContain("vars.SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE");
    expect(workflow).not.toContain("write-apple-app-site-association.mjs");
    expect(workflow).not.toContain("Generate Apple Universal Links association");
    expect(workflow).not.toContain("Verify Apple association in prebuilt output");
    expect(workflow).not.toContain("Verify Apple Universal Links endpoint");
    expect(workflow).not.toContain("APPLE_TEAM_ID");
    expect(workflow).not.toContain("ANDROID_KEYSTORE_BASE64");
    expect(workflow).toContain('RELEASE_READINESS_TARGET: "web"');
    expect(workflow).toMatch(/build_frontend:\n\s+needs:\n\s+- validation\n\s+- preflight/);

    const aasaHeaders = vercel.headers.find(
      (entry: { source?: string }) => entry.source === "/.well-known/apple-app-site-association",
    );
    expect(aasaHeaders).toBeUndefined();
  });
});
