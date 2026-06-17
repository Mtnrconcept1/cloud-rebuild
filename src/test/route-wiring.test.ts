import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FEATURE_DEFINITIONS } from "@/lib/featureCatalog";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = resolve(repoRoot, "src");
const appSource = readFileSync(resolve(srcRoot, "App.tsx"), "utf8");

const appRoutes = Array.from(appSource.matchAll(/<Route\s+path="([^"]+)"/g))
  .map((match) => match[1])
  .filter((route) => route !== "*");

const featureRouteTargets = FEATURE_DEFINITIONS.flatMap((definition) =>
  (definition.routeTargets || []).map((routeTarget) => ({
    featureName: definition.name,
    routeTarget,
  })),
);

const featureRouteTargetSet = new Set(featureRouteTargets.map(({ routeTarget }) => routeTarget));

const CORE_ROUTES = new Set([
  "/",
  "/auth",
  "/recherche",
  "/restaurants/:city",
  "/restaurants/:city/:category",
  "/r/:slug",
  "/restaurant/:id",
  "/panier",
  "/profil",
  "/notifications",
  "/dashboard/notifications",
  "/courier/notifications",
  "/contact",
  "/cgu",
  "/cookies",
  "/politique-confidentialite",
  "/a-propos",
  "/packs-restaurateur",
  "/conditions-restaurateurs",
  "/restaurateurs/geneve",
  "/restaurateurs/google-business",
  "/restaurateurs/alternative-commission-couvert",
  "/miamz-solidaires",
  "/aide",
  "/admin",
]);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePatternToRegex(routePath: string) {
  const pattern = routePath
    .split("/")
    .map((segment) => segment.startsWith(":") ? "[^/]+" : escapeRegex(segment))
    .join("/");

  return new RegExp(`^${pattern}$`);
}

const routeMatchers = appRoutes.map((routePath) => ({
  routePath,
  matcher: routePatternToRegex(routePath),
}));

function normalizeTarget(target: string) {
  const [pathWithoutHash] = target.split("#");
  const [pathWithoutSearch] = pathWithoutHash.split("?");
  return pathWithoutSearch.replace(/\/+$/, "") || "/";
}

function findMatchingRoute(target: string) {
  const normalizedTarget = normalizeTarget(target);
  return routeMatchers.find(({ matcher }) => matcher.test(normalizedTarget))?.routePath || null;
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = resolve(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (absolutePath === resolve(srcRoot, "test")) return [];
      return walkFiles(absolutePath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [absolutePath] : [];
  });
}

function collectStaticInternalTargets() {
  const targets = new Map<string, Set<string>>();
  const patterns = [
    /\b(?:to|href)="(\/[^"#]*(?:#[^"]*)?)"/g,
    /\b(?:to|href)='(\/[^'#]*(?:#[^']*)?)'/g,
    /\bnavigate\("(\/[^"#]*(?:#[^"]*)?)"/g,
    /\bnavigate\('(\/[^'#]*(?:#[^']*)?)'/g,
  ];

  for (const filePath of walkFiles(srcRoot)) {
    const source = readFileSync(filePath, "utf8");
    const relativePath = relative(repoRoot, filePath).replace(/\\/g, "/");

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const target = match[1];
        if (!targets.has(target)) targets.set(target, new Set());
        targets.get(target)!.add(relativePath);
      }
    }
  }

  return targets;
}

describe("route wiring", () => {
  it("keeps feature route targets backed by App routes", () => {
    const missingRoutes = featureRouteTargets
      .filter(({ routeTarget }) => !findMatchingRoute(routeTarget))
      .map(({ featureName, routeTarget }) => `${featureName}: ${routeTarget}`);

    expect(missingRoutes).toEqual([]);
  });

  it("keeps every non-feature App route documented as a core route", () => {
    const undocumentedRoutes = appRoutes.filter((routePath) =>
      !featureRouteTargetSet.has(routePath) && !CORE_ROUTES.has(routePath)
    );

    expect(undocumentedRoutes).toEqual([]);
  });

  it("keeps static internal links pointed at App routes", () => {
    const brokenTargets = Array.from(collectStaticInternalTargets().entries())
      .filter(([target]) => !findMatchingRoute(target))
      .map(([target, files]) => ({
        target,
        files: Array.from(files),
      }));

    expect(brokenTargets).toEqual([]);
  });
});
