import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function hasHost(rule: { has?: Array<{ type?: string; value?: string }> }, hostname: string) {
  return rule.has?.some((condition) => condition.type === "host" && condition.value === hostname) ?? false;
}

function headersByName(rule: { headers?: Array<{ key: string; value: string }> }) {
  return new Map((rule.headers || []).map(({ key, value }) => [key.toLowerCase(), value]));
}

describe("marketing subdomain integration contract", () => {
  it("uses only a same-origin root redirect at the Vercel edge", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      redirects?: Array<{
        source: string;
        destination: string;
        permanent?: boolean;
        has?: Array<{ type?: string; value?: string }>;
      }>;
      rewrites?: Array<{
        source: string;
        destination: string;
        has?: Array<{ type?: string; value?: string }>;
      }>;
    };
    const redirects = vercel.redirects || [];
    const marketingHostRedirects = redirects.filter((rule) => hasHost(rule, "marketing.thetok.ch"));

    expect(marketingHostRedirects).toContainEqual(expect.objectContaining({
      source: "/",
      destination: "/marketing",
      permanent: false,
    }));
    expect(marketingHostRedirects.every((rule) => !/^https?:\/\//i.test(rule.destination))).toBe(true);
    expect(redirects.some((rule) => /marketing\.thetok\.ch/i.test(rule.destination))).toBe(false);
    expect((vercel.rewrites || []).some((rule) => hasHost(rule, "marketing.thetok.ch"))).toBe(false);
  });

  it("sets private no-store and noindex headers on the entire marketing host", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      headers?: Array<{
        source: string;
        has?: Array<{ type?: string; value?: string }>;
        headers?: Array<{ key: string; value: string }>;
      }>;
    };
    const rule = (vercel.headers || []).find((candidate) =>
      candidate.source === "/:path*" && hasHost(candidate, "marketing.thetok.ch")
    );
    expect(rule).toBeDefined();

    const values = headersByName(rule || {});
    expect(values.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(values.get("cache-control")).toBe("private, no-store, max-age=0, must-revalidate");
    expect(values.get("referrer-policy")).toBe("no-referrer");
  });

  it("allows the exact marketing origin through shared CORS without a wildcard", () => {
    const cors = read("supabase/functions/_shared/cors.ts");

    expect(cors).toContain('"https://marketing.thetok.ch"');
    expect(cors).toContain('"Vary": "Origin"');
    expect(cors).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(cors).toContain('headers["Access-Control-Allow-Origin"] = origin');
  });

  it("keeps OAuth callbacks canonical and excludes marketing from PKCE redirect targets", () => {
    const config = read("supabase/config.toml");
    const authDomains = read("src/lib/authDomains.ts");
    const marketingBoundary = read("src/components/marketing/MarketingHostBoundary.tsx");
    const marketingDomains = read("src/lib/marketingDomains.ts");

    expect(config).not.toMatch(/marketing\.thetok\.ch\/(?:auth|auth\/callback)/i);
    expect(authDomains).toContain('TOK_CANONICAL_AUTH_HOST = "www.thetok.ch"');
    expect(marketingBoundary).toMatch(/getSanitizedMarketingHostRedirectTarget\((?:window\.location|browserLocation)\.href\)/);
    expect(marketingBoundary.indexOf("getSanitizedMarketingHostRedirectTarget"))
      .toBeLessThan(marketingBoundary.indexOf("useEffect("));
    expect(marketingBoundary).toContain("if (shouldRedirect) return <LoadingMarketingRedirect />");
    expect(marketingBoundary).toContain("return <>{children}</>");
    expect(marketingDomains).toContain("buildSanitizedAuthRedirectUrl");
    expect(marketingDomains).toContain("getSupabaseAuthRedirectState");

    expect(config).toMatch(/\[functions\.marketing-orchestrator\]\s+verify_jwt\s*=\s*false/);
    expect(config).toMatch(/\[functions\.marketing-provider-webhook\]\s+verify_jwt\s*=\s*false/);
  });

  it("wires /marketing through an admin role guard and an active feature flag", () => {
    const app = read("src/App.tsx");
    const catalog = read("src/lib/featureCatalog.ts");
    const compactApp = app.replace(/\s+/g, " ");
    const featureStart = catalog.indexOf('name: "admin-marketing-operations"');
    const featureEnd = catalog.indexOf("\n  },", featureStart);
    const marketingFeature = catalog.slice(featureStart, featureEnd > featureStart ? featureEnd : undefined);
    const routeStart = compactApp.indexOf('<Route path="/marketing"');
    const nextRoute = compactApp.indexOf("<Route path=", routeStart + 1);
    const marketingRoute = compactApp.slice(routeStart, nextRoute > routeStart ? nextRoute : undefined);

    expect(app).toContain("MarketingHostBoundary");
    expect(app).toContain("<MarketingHostBoundary>");
    expect(app).toContain("function CanonicalWorkspaceHostBoundary");
    expect(app).toContain("marketingExecutionLocation ? children");
    expect(app.indexOf("<MarketingHostBoundary>")).toBeLessThan(app.indexOf("<AuthProvider>"));
    expect(app).toContain('const adminMarketingOperationsEnabled = hasFeature("admin-marketing-operations")');
    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(marketingRoute).toContain('<ProtectedRoute requiredRole="admin">');
    expect(marketingRoute).toContain("<FeatureSwitch enabled={adminMarketingOperationsEnabled}");
    expect(marketingRoute).toContain("<MarketingWorkspace />");
    expect(marketingRoute).not.toContain("<AdminProtectedRoute>");
    expect(app).toMatch(/isMarketingPath\(pathname\)|pathname\s*===\s*"\/marketing"/);
    expect(featureStart).toBeGreaterThanOrEqual(0);
    expect(marketingFeature).toMatch(/defaultEnabled:\s*true/);
    expect(marketingFeature).toContain('routeTargets: ["/marketing"]');
    expect(marketingFeature).toContain('group: "admin_tools"');
  });

  it("ships no literal credentials in the new integration files", () => {
    const source = [
      "src/lib/marketingDomains.ts",
      "src/components/marketing/MarketingHostBoundary.tsx",
      "vercel.json",
      "supabase/functions/_shared/cors.ts",
      "supabase/config.toml",
      "src/lib/featureCatalog.ts",
      "src/App.tsx",
    ].map(read).join("\n");

    expect(source).not.toMatch(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
    expect(source).not.toMatch(/\b(?:sk_(?:live|test)|sk-proj-|sb_secret_)[A-Za-z0-9_-]{12,}/);
    expect(source).not.toMatch(/\b(?:whsec_|xox[baprs]-)[A-Za-z0-9_-]{12,}/);
    expect(source).not.toMatch(/\bAIza[0-9A-Za-z_-]{20,}/);
    expect(source).not.toMatch(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/);
  });
});
