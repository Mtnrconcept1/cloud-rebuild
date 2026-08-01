import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("vercel config", () => {
  it("opens the dedicated commercial host on the isolated workspace", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      redirects?: Array<{
        source?: string;
        destination?: string;
        permanent?: boolean;
        has?: Array<{ type?: string; value?: string }>;
      }>;
    };

    expect(config.redirects).toContainEqual({
      source: "/",
      has: [{ type: "host", value: "commercial.thetok.ch" }],
      destination: "/commercial",
      permanent: false,
    });

    // Cross-origin redirects remain in the role-aware browser boundary so it
    // can strip PKCE codes and legacy URL fragments before changing origins.
    expect(config.redirects).not.toContainEqual(expect.objectContaining({
      destination: expect.stringMatching(/^https:\/\/commercial\.thetok\.ch/),
    }));
  });

  it("opens the dedicated marketing host on the isolated admin workspace", () => {
    const config = JSON.parse(readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8")) as {
      redirects?: Array<{
        source?: string;
        destination?: string;
        permanent?: boolean;
        has?: Array<{ type?: string; value?: string }>;
      }>;
      headers?: Array<{
        has?: Array<{ type?: string; value?: string }>;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };

    expect(config.redirects).toContainEqual({
      source: "/",
      has: [{ type: "host", value: "marketing.thetok.ch" }],
      destination: "/marketing",
      permanent: false,
    });
    expect(config.redirects).not.toContainEqual(expect.objectContaining({
      destination: expect.stringMatching(/^https:\/\/marketing\.thetok\.ch/),
    }));

    const headers = config.headers?.find((entry) => entry.has?.some(
      (condition) => condition.type === "host" && condition.value === "marketing.thetok.ch",
    ))?.headers || [];
    expect(headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" });
    expect(headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
    expect(headers).toContainEqual({ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" });
  });

  it("routes admin paths through the dedicated admin domain", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      redirects?: Array<{
        source?: string;
        destination?: string;
        permanent?: boolean;
        has?: Array<{ type?: string; value?: string }>;
      }>;
    };
    const redirects = config.redirects || [];

    expect(redirects).toContainEqual({
      source: "/",
      has: [{ type: "host", value: "admin.thetok.ch" }],
      destination: "/admin",
      permanent: false,
    });

    for (const publicHost of ["www.thetok.ch", "thetok.ch"]) {
      expect(redirects).toContainEqual({
        source: "/admin",
        has: [{ type: "host", value: publicHost }],
        destination: "https://admin.thetok.ch/admin",
        permanent: false,
      });
      expect(redirects).toContainEqual({
        source: "/admin/:path*",
        has: [{ type: "host", value: publicHost }],
        destination: "https://admin.thetok.ch/admin/:path*",
        permanent: false,
      });
    }
  });

  it("limits SPA rewrites to private application surfaces so unknown public URLs stay 404", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");

    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    const privateSurfacePattern = "/:surface(admin|marketing|dashboard|courier|commercial|profil|memoire-tok|notifications|commandes|commande|reservations|mon-espace|compte|espace-client|mes-avis|points-cadeau|panier|auth|oauth|espaces|r)";

    expect(config.rewrites).not.toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
    expect(config.rewrites).toEqual(expect.arrayContaining([
      { source: privateSurfacePattern, destination: "/index.html" },
      { source: `${privateSurfacePattern}/:path*`, destination: "/index.html" },
      { source: "/tok-connect/developer", destination: "/index.html" },
      { source: "/tok-connect/developer/:path*", destination: "/index.html" },
    ]));
  });

  it("proxies Supabase Edge Functions before private SPA rewrites", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const rewrites = config.rewrites || [];
    const edgeFunctionIndex = rewrites.findIndex((entry) =>
      entry.source === "/functions/v1/:path*" &&
      entry.destination === "https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/:path*",
    );
    const spaFallbackIndex = rewrites.findIndex((entry) =>
      entry.source?.startsWith("/:surface(") && entry.destination === "/index.html"
    );

    expect(edgeFunctionIndex).toBeGreaterThan(-1);
    expect(spaFallbackIndex).toBeGreaterThan(edgeFunctionIndex);
  });

  it("keeps legacy public image aliases ahead of private SPA rewrites", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const rewrites = config.rewrites || [];
    const spaFallbackIndex = rewrites.findIndex((entry) =>
      entry.source?.startsWith("/:surface(") && entry.destination === "/index.html"
    );

    for (const alias of [
      ["/images/fondue moitié moitié.jpg", "/images/fondue-moitie-moitie.jpg"],
      ["/images/fondue%20moiti%C3%A9%20moiti%C3%A9.jpg", "/images/fondue-moitie-moitie.jpg"],
      ["/images/meringue double.webp", "/images/meringue-double.webp"],
      ["/images/milshake oreo.jpg", "/images/milkshake-oreo.jpg"],
      ["/images/milshake vanille.jpeg", "/images/milkshake-vanille.jpeg"],
      ["/images/moshi glacés.jpg", "/images/mochi-glaces.jpg"],
      ["/images/rösti bernois.jpg", "/images/rosti-bernois.jpg"],
      ["/images/salade du marché.jpg", "/images/salade-du-marche.jpg"],
      ["/images/taboulé.webp", "/images/taboule.webp"],
    ]) {
      const aliasIndex = rewrites.findIndex((entry) => entry.source === alias[0] && entry.destination === alias[1]);

      expect(aliasIndex).toBeGreaterThan(-1);
      expect(spaFallbackIndex).toBeGreaterThan(aliasIndex);
    }
  });

  it("sets browser security headers for all routes", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    };
    const globalHeaders = config.headers?.find((entry) => entry.source === "/(.*)")?.headers || [];
    const headerKeys = new Set(globalHeaders.map((header) => header.key));
    const csp = globalHeaders.find((header) => header.key === "Content-Security-Policy")?.value || "";

    expect(Array.from(headerKeys)).toEqual(expect.arrayContaining([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Frame-Options",
    ]));
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://router.project-osrm.org");
    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("https://www.thetok.ch");
    expect(csp).toContain("https://cloud-rebuild-recovered.vercel.app");
    expect(csp).toContain("https://js.stripe.com");
    expect(csp).toContain("https://hooks.stripe.com");
    expect(globalHeaders.find((header) => header.key === "X-Frame-Options")?.value).toBe("SAMEORIGIN");
  });

  it("keeps the commercial demo out of search indexes and same-origin framed", () => {
    const config = JSON.parse(readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8")) as {
      headers?: Array<{
        has?: Array<{ type?: string; value?: string }>;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const commercialHeaders = config.headers?.find((entry) => entry.has?.some(
      (condition) => condition.type === "host" && condition.value === "commercial.thetok.ch",
    ))?.headers || [];

    expect(commercialHeaders).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow, noarchive",
    });
    expect(commercialHeaders).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
    expect(commercialHeaders).toContainEqual({ key: "X-Frame-Options", value: "SAMEORIGIN" });
    const commercialCsp = commercialHeaders.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value || "";
    expect(commercialCsp).toContain("connect-src 'self'");
    expect(commercialCsp).toContain("https://*.supabase.co");
    expect(commercialCsp).toContain("https://api.stripe.com");
    expect(commercialCsp).not.toContain("https://api.openai.com");
  });

  it("serves noindex headers on exact and nested private routes without prefix overmatching", () => {
    const config = JSON.parse(readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8")) as {
      headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    };
    const noindexSources = (config.headers || [])
      .filter((entry) => entry.headers?.some((header) => header.key === "X-Robots-Tag"))
      .map((entry) => entry.source);
    const privateSurfacePattern = "/:surface(admin|marketing|dashboard|courier|commercial|profil|memoire-tok|notifications|commandes|commande|reservations|mon-espace|compte|espace-client|mes-avis|points-cadeau|panier|auth|oauth|espaces|r)";

    expect(noindexSources).toContain(privateSurfacePattern);
    expect(noindexSources).toContain(`${privateSurfacePattern}/:path*`);
    expect(noindexSources).toContain("/tok-connect/developer");
    expect(noindexSources).toContain("/tok-connect/developer/:path*");
    expect(noindexSources).not.toContain(expect.stringContaining(")(.*)"));
  });

  it("keeps delivery map routing compatible with production CSP and Leaflet cleanup", () => {
    const mapPath = path.resolve(process.cwd(), "src/components/DeliveryMap.tsx");
    const mapSource = readFileSync(mapPath, "utf8");

    expect(mapSource).toContain("zoomAnimation: false");
    expect(mapSource).toContain("markerZoomAnimation: false");
    expect(mapSource).toContain("map.stop()");
    expect(mapSource).toContain("animate: false");
  });

  it("deploys production through GitHub Actions instead of a canceled Vercel Git hook", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-production.yml");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      git?: { deploymentEnabled?: boolean };
    };
    const workflow = readFileSync(workflowPath, "utf8");

    expect(config.git?.deploymentEnabled).toBe(false);
    expect(workflow).not.toContain("VERCEL_DEPLOY_HOOK_URL");
    expect(workflow).not.toContain("Trigger Vercel production deploy hook");
    expect(workflow).toContain("VERCEL_CLI_VERSION: 55.0.0");
    expect(workflow).not.toContain("vercel@latest");
    expect(workflow).toContain('pnpm dlx "vercel@${VERCEL_CLI_VERSION}" build --prod --token="$VERCEL_TOKEN"');
    expect(workflow).toContain('pnpm dlx "vercel@${VERCEL_CLI_VERSION}" deploy --prebuilt --prod --token="$VERCEL_TOKEN"');
    expect(workflow).toContain("tar -czf \"$RUNNER_TEMP/vercel-output.tgz\"");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("actions/download-artifact@v5");
    expect(workflow).toContain("deploy_frontend:");
    expect(workflow).toContain("VITE_SUPABASE_URL: https://wwcrtyoueexyxkkikaos.supabase.co");
    expect(workflow).toContain("VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}");
    expect(workflow).toContain("VITE_FIREBASE_VAPID_KEY: ${{ secrets.VITE_FIREBASE_VAPID_KEY }}");
  });
});
