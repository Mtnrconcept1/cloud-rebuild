import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TOK_MARKETING_APP_HOST,
  TOK_MARKETING_APP_ORIGIN,
  getMarketingHostRedirectTarget,
  getMarketingNavigationHref,
  getSanitizedMarketingHostRedirectTarget,
  isMarketingAppHost,
  isMarketingPath,
  isOwnedMarketingPreviewHost,
} from "@/lib/marketingDomains";

describe("marketing domain isolation", () => {
  it("uses an exact dedicated host and namespace", () => {
    expect(TOK_MARKETING_APP_HOST).toBe("marketing.thetok.ch");
    expect(TOK_MARKETING_APP_ORIGIN).toBe("https://marketing.thetok.ch");
    expect(isMarketingAppHost("marketing.thetok.ch")).toBe(true);
    expect(isMarketingAppHost("marketing.thetok.ch.evil.example")).toBe(false);
    expect(isMarketingPath("/marketing")).toBe(true);
    expect(isMarketingPath("/marketing/login")).toBe(true);
    expect(isMarketingPath("/marketing/campaigns")).toBe(true);
    expect(isMarketingPath("/marketing-public")).toBe(false);
  });

  it("canonicalizes marketing paths from every production surface", () => {
    for (const hostname of ["www.thetok.ch", "thetok.ch", "admin.thetok.ch", "commercial.thetok.ch"]) {
      expect(getMarketingHostRedirectTarget({
        hostname,
        pathname: "/marketing",
        search: "?view=calendar",
      })).toBe("https://marketing.thetok.ch/marketing?view=calendar");
    }
  });

  it("keeps owned previews self-contained", () => {
    const preview = "cloud-rebuild-recovered-feature-123-mtnrconcepts-projects.vercel.app";
    expect(isOwnedMarketingPreviewHost(preview)).toBe(true);
    expect(getMarketingHostRedirectTarget({ hostname: preview, pathname: "/marketing" })).toBeNull();
    expect(getMarketingNavigationHref("/marketing", preview)).toBe("/marketing");
  });

  it("moves the dedicated host root into its isolated namespace", () => {
    expect(getMarketingHostRedirectTarget({
      hostname: "marketing.thetok.ch",
      pathname: "/",
    })).toBe("https://marketing.thetok.ch/marketing");
  });

  it("removes PKCE and token controls on the canonical marketing host itself", () => {
    const target = getSanitizedMarketingHostRedirectTarget(
      "https://marketing.thetok.ch/marketing?view=campaigns&code=secret&state=opaque#access_token=leaked",
    );
    expect(target).toBe("https://marketing.thetok.ch/marketing?view=campaigns");
    expect(target).not.toContain("secret");
    expect(target).not.toContain("access_token");
  });

  it("never forwards auth callback credentials between origins", () => {
    const target = getSanitizedMarketingHostRedirectTarget(
      "https://www.thetok.ch/marketing?view=calendar&code=secret#refresh_token=leaked",
    );
    expect(target).toBe("https://marketing.thetok.ch/marketing?view=calendar");
  });

  it("preserves public OAuth callbacks until Auth exchanges the PKCE code", () => {
    expect(getSanitizedMarketingHostRedirectTarget(
      "https://www.thetok.ch/auth/callback?code=google-pkce-code&next=%2Fadmin",
    )).toBeNull();
    expect(getSanitizedMarketingHostRedirectTarget(
      "https://www.thetok.ch/auth/callback?error=access_denied&error_description=cancelled",
    )).toBeNull();
  });

  it("still strips credentials when an auth callback lands on the marketing host", () => {
    expect(getSanitizedMarketingHostRedirectTarget(
      "https://marketing.thetok.ch/auth/callback?code=secret&next=%2Fadmin",
    )).toBe("https://www.thetok.ch/auth?next=%2Fadmin");
  });

  it("blocks child rendering while a canonical redirect is pending", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/marketing/MarketingHostBoundary.tsx"), "utf8");
    expect(source).toContain("{ children }: { children: ReactNode }");
    expect(source).toContain("if (shouldRedirect) return <LoadingMarketingRedirect />");
    expect(source).toContain("getSanitizedMarketingHostRedirectTarget");
    expect(source).toContain("window.location.replace(resolvedTarget)");
  });

  it("uses a fixed same-origin login route for expired BFF sessions", () => {
    const source = readFileSync(resolve(process.cwd(), "src/marketing/marketingBffClient.ts"), "utf8");
    expect(source).toContain('MARKETING_LOGIN_PATH = "/marketing/login"');
    expect(source).toContain("window.location.replace(MARKETING_LOGIN_PATH)");
    expect(source).not.toMatch(/redirect(?:Url|To|_to)\s*:/i);
  });
});
