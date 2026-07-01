import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("vercel config", () => {
  it("defines a SPA rewrite so deep links resolve to index.html", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");

    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(config.rewrites).toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
  });

  it("proxies Supabase Edge Functions before the SPA fallback", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const rewrites = config.rewrites || [];
    const edgeFunctionIndex = rewrites.findIndex((entry) =>
      entry.source === "/functions/v1/:path*" &&
      entry.destination === "https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/:path*",
    );
    const spaFallbackIndex = rewrites.findIndex((entry) => entry.source === "/(.*)" && entry.destination === "/index.html");

    expect(edgeFunctionIndex).toBeGreaterThan(-1);
    expect(spaFallbackIndex).toBeGreaterThan(edgeFunctionIndex);
  });

  it("keeps legacy public image aliases ahead of the SPA fallback", () => {
    const configPath = path.resolve(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const rewrites = config.rewrites || [];
    const spaFallbackIndex = rewrites.findIndex((entry) => entry.source === "/(.*)" && entry.destination === "/index.html");

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
    expect(workflow).toContain("pnpm dlx vercel@latest build --prod --token=\"$VERCEL_TOKEN\"");
    expect(workflow).toContain("pnpm dlx vercel@latest deploy --prebuilt --prod --token=\"$VERCEL_TOKEN\"");
    expect(workflow).toContain("deploy_frontend:");
    expect(workflow).toContain("VITE_SUPABASE_URL: https://wwcrtyoueexyxkkikaos.supabase.co");
    expect(workflow).toContain("VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}");
    expect(workflow).toContain("VITE_FIREBASE_VAPID_KEY: ${{ secrets.VITE_FIREBASE_VAPID_KEY }}");
  });
});
