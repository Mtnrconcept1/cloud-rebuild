import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildSanitizedAuthRedirectUrl,
  getSupabaseAuthRedirectState,
  hasSensitiveAuthFragment,
} from "@/lib/authRedirect";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("auth redirect security", () => {
  it("uses Supabase PKCE and a dedicated callback route for OAuth", () => {
    const client = read("src/integrations/supabase/client.ts");
    const authPage = read("src/pages/Auth.tsx");
    const app = read("src/App.tsx");

    expect(client).toContain('flowType: "pkce"');
    expect(client).toContain("detectSessionInUrl: false");
    expect(authPage).toContain("exchangeCodeForSession");
    expect(authPage).toContain("/auth/callback");
    expect(app).toContain('path="/auth/callback"');
  });

  it("removes OAuth codes and legacy token fragments from browser URLs", () => {
    expect(buildSanitizedAuthRedirectUrl("https://www.thetok.ch/auth/callback?code=abc&state=oauth&type=client"))
      .toBe("/auth?type=client");
    expect(buildSanitizedAuthRedirectUrl("https://www.thetok.ch/auth#access_token=secret&refresh_token=hidden"))
      .toBe("/auth");
    expect(hasSensitiveAuthFragment("#provider_token=secret")).toBe(true);

    const state = getSupabaseAuthRedirectState("https://www.thetok.ch/auth/callback?code=abc");
    expect(state).toMatchObject({
      code: "abc",
      hasAuthRedirect: true,
      hasSensitiveFragment: false,
    });
  });

  it("keeps the PWA manifest on the static self-hosted file required by CSP", () => {
    const logoHook = read("src/hooks/useTokLogo.ts");

    expect(logoHook).toContain('manifestLink.href = "/manifest.json"');
    expect(logoHook).not.toContain("URL.createObjectURL");
    expect(logoHook).not.toContain("new Blob");
  });

  it("keeps logout local cleanup resilient when the remote session is stale", () => {
    const authProvider = read("src/lib/auth.tsx");

    expect(authProvider).toContain("clearLocalAuthenticatedState();");
    expect(authProvider).toContain("remote sign out failed after local cleanup");
    expect(authProvider).toContain("setUser(null);");
  });
});
