import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildApplicationIndex,
  hydrateApplicationSearchResults,
  INDEX_JSON_PATH,
  listRepositoryFiles,
  REFERENCE_MARKDOWN_PATH,
  renderApplicationReference,
  REPOSITORY_ROOT,
  searchApplicationIndex,
  serializeIndex,
} from "../../scripts/application-index-core.mjs";

describe("application search index", () => {
  const index = buildApplicationIndex(REPOSITORY_ROOT);

  it("is deterministically generated from the current repository", () => {
    expect(readFileSync(path.join(REPOSITORY_ROOT, INDEX_JSON_PATH), "utf8")).toBe(serializeIndex(index));
    expect(readFileSync(path.join(REPOSITORY_ROOT, REFERENCE_MARKDOWN_PATH), "utf8")).toBe(
      renderApplicationReference(index),
    );
  });

  it("has unique records and covers every repository file", () => {
    const ids = index.records.map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fileRecords = new Set(
      index.records
        .filter((item: { type: string }) => item.type === "file")
        .map((item: { path: string }) => item.path),
    );
    const repositoryFiles = listRepositoryFiles(REPOSITORY_ROOT);
    const repositoryFileSet = new Set(repositoryFiles);
    expect(fileRecords.size).toBe(repositoryFiles.length);
    expect(repositoryFiles.every((file) => fileRecords.has(file))).toBe(true);
    expect(
      index.records
        .filter((item: { path: string | null }) => item.path)
        .every((item: { path: string }) => repositoryFileSet.has(item.path)),
    ).toBe(true);

    const serialized = serializeIndex(index);
    expect(serialized).not.toMatch(/sk_(?:live|test)_[A-Za-z0-9]{16,}/);
    expect(serialized).not.toContain("-----BEGIN PRIVATE KEY-----");
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./);
  });

  it("covers all primary application registries", () => {
    expect(index.catalogs.frontendRoutes).toHaveLength(131);
    expect(index.catalogs.featureFlags).toHaveLength(99);
    expect(index.catalogs.apiRoutes).toHaveLength(9);
    expect(index.catalogs.edgeFunctions).toHaveLength(114);
    expect(index.catalogs.edgeHttpRoutes).toHaveLength(20);
    expect(index.catalogs.marketingOperations).toHaveLength(36);
    expect(index.catalogs.cronJobs).toHaveLength(33);
    expect(index.catalogs.storageBuckets).toHaveLength(9);
    expect(index.catalogs.databaseContract).toHaveLength(228);
    expect(index.catalogs.pages.length).toBeGreaterThan(100);
    expect(index.catalogs.databaseObjects.length).toBeGreaterThan(100);
    expect(index.catalogs.files.length).toBeGreaterThan(2_000);
    expect(index.catalogs.frontendRoutes.some((route: { path: string }) => route.path === "/marketing")).toBe(true);
    expect(index.catalogs.apiRoutes.some((route: { route: string }) => route.route === "/api/marketing/launch")).toBe(true);
    expect(index.catalogs.edgeFunctions.some((fn: { name: string }) => fn.name === "tok-connect-remote-mcp")).toBe(true);
    expect(
      index.catalogs.publicRoutes.some((route: { route: string }) => (
        route.route === "/.well-known/apple-app-site-association"
      )),
    ).toBe(true);
    expect(index.catalogs.workerRoutes.map((item: { route: string }) => item.route)).toEqual(["/healthz", "/readyz"]);
    expect(
      index.catalogs.edgeHttpRoutes.some((item: { method: string; route: string }) => (
        item.method === "GET" && item.route === "/v1/restaurants"
      )),
    ).toBe(true);
    expect(
      index.catalogs.edgeHttpRoutes.some((item: { method: string; route: string }) => (
        item.method === "POST" && item.route === "/v3/CreateBooking/"
      )),
    ).toBe(true);
    expect(
      index.catalogs.routingAuthorities.some((item: { kind: string; value: string }) => (
        item.kind === "deep-link" && item.value === "tok://availability/{restaurant_id}"
      )),
    ).toBe(true);
    expect(
      index.catalogs.routingAuthorities.some((item: { kind: string; value: string }) => (
        item.kind === "commercial-frame"
        && item.value === "/commercial/demo-live/frame/:surface/:sessionId/*"
      )),
    ).toBe(true);
    expect(
      index.catalogs.routingAuthorities.some((item: { kind: string; value: string }) => (
        item.kind === "pwa-shortcut" && item.value === "/mon-espace?source=pwa-shortcut"
      )),
    ).toBe(true);
    expect(
      index.catalogs.edgeFunctions.find((item: { name: string }) => item.name === "stripe-setup")?.configured,
    ).toBe(false);
    expect(
      index.catalogs.edgeFunctions
        .flatMap((item: { actions: string[] }) => item.actions)
        .some((action: string) => ["Bistronomie", "Italien", "reservations", "timeZoneName"].includes(action)),
    ).toBe(false);
    expect(index.catalogs.publicRoutes.some((item: { kind: string }) => item.kind === "media")).toBe(true);
    expect(
      index.catalogs.seoBuild.generatedArtifacts.some((item: { path: string }) => (
        item.path === ".vercel/stoppin-venue-redirects.json"
      )),
    ).toBe(true);
    expect(index.catalogs.queryParameters.some((item: { name: string }) => item.name === "view")).toBe(true);
    for (const falsePositive of [
      "APP_BASE_URL",
      "Body",
      "GOOGLE_ACTIONS_CENTER_PASSWORD",
      "SUPABASE_URL",
      "authorization",
      "content-type",
      "x-robots-tag",
    ]) {
      expect(index.catalogs.queryParameters.some((item: { name: string }) => item.name === falsePositive)).toBe(false);
    }
    expect(
      searchApplicationIndex(index.records, "print-sandbox-diagnose", { type: "runtime-edge-drift" })
        .some((item: { title: string }) => item.title === "print-sandbox-diagnose"),
    ).toBe(true);

    for (const route of index.catalogs.apiRoutes) {
      const expected = route.route === "/api/marketing/session" ? ["DELETE", "GET"] : ["POST"];
      expect(route.methods).toEqual(expected);
    }
  });

  it("lists every SQL migration exactly once", () => {
    const migrationFiles = readdirSync(path.join(REPOSITORY_ROOT, "supabase/migrations"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => `supabase/migrations/${entry.name}`)
      .sort();
    const indexedMigrations = index.catalogs.migrations
      .map((migration: { path: string }) => migration.path)
      .sort();

    expect(migrationFiles.length).toBeGreaterThan(0);
    expect(new Set(indexedMigrations).size).toBe(indexedMigrations.length);
    // Compare paths, not just counts: a missing file replaced by a duplicate must fail.
    expect(indexedMigrations).toEqual(migrationFiles);
  });

  it("finds routes, features, database objects and infrastructure", () => {
    expect(searchApplicationIndex(index.records, "marketing campagne", { limit: 50 }).length).toBeGreaterThan(0);
    expect(
      searchApplicationIndex(index.records, "guardian", { type: "frontend-route" })
        .some((item: { title: string }) => item.title === "/admin/guardian"),
    ).toBe(true);
    expect(
      searchApplicationIndex(index.records, "stripe", { type: "integration" })
        .some((item: { title: string }) => item.title === "Stripe"),
    ).toBe(true);
    expect(searchApplicationIndex(index.records, "postgresql", { type: "database-object" }).length).toBeGreaterThan(0);

    const hydrated = hydrateApplicationSearchResults(
      index,
      searchApplicationIndex(index.records, "/v3/HealthCheck/", { type: "edge-http-route" }),
    );
    expect(hydrated[0]?.details).toMatchObject({
      function: "google-actions-center",
      method: "GET",
      route: "/v3/HealthCheck/",
    });
  });

  it("keeps generated artifacts reviewable and file classifications accurate", () => {
    expect(Buffer.byteLength(serializeIndex(index), "utf8")).toBeLessThan(10_000_000);
    expect(renderApplicationReference(index)).not.toMatch(/\n\n$/);
    expect(
      index.catalogs.files.find((item: { path: string }) => item.path === "src/test/application-search-index.test.ts")
        ?.category,
    ).toBe("test");
  });
});
