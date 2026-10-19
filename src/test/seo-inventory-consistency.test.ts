import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  reconcileCityInventoryHtml,
  reconcileSeoInventory,
  reconcileSpecializedInventoryHtml,
  removeDemotedCitiesFromSitemap,
} from "../../scripts/harden-seo-inventory-consistency.mjs";

type LocalPageType = "city" | "cuisine" | "district" | "intent";

const policy = { minCityRestaurants: 3, minSpecializedRestaurants: 3, maxParentCoverage: 0.8 };

function restaurantRoute(slug: string) {
  return `/restaurants/geneve/r/${slug}`;
}

function allowedRestaurants(slugs: string[]) {
  return new Set(slugs.map(restaurantRoute));
}

function localHtml(
  pageType: LocalPageType,
  route: string,
  slugs: string[],
  options: {
    parentInventoryCount?: number;
    inventoryCount?: number;
    snapshotPath?: string;
    includeSnapshot?: boolean;
    itemListComplete?: boolean;
    indexable?: boolean;
    robots?: string;
  } = {},
) {
  const inventoryCount = options.inventoryCount ?? slugs.length;
  const entries = slugs.map((slug, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: `Restaurant ${slug}`,
    url: `https://www.thetok.ch${restaurantRoute(slug)}`,
  }));
  const jsonLd = { "@type": "ItemList", numberOfItems: inventoryCount, itemListElement: entries };
  const snapshot = {
    version: 1,
    path: options.snapshotPath ?? route,
    pageType,
    inventoryCount,
    parentInventoryCount: pageType === "city" ? null : options.parentInventoryCount ?? 5,
    itemListComplete: options.itemListComplete ?? true,
    policy,
    indexable: options.indexable ?? true,
  };
  const inventoryScript = options.includeSnapshot === false
    ? ""
    : `<script id="tok-local-inventory" type="application/json">${JSON.stringify(snapshot)}</script>`;
  return `<!doctype html><html><head><meta name="robots" content="${options.robots ?? "index,follow"}"><script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify(jsonLd)}</script>${inventoryScript}</head><body><p>${inventoryCount} adresses actives sont répertoriées sur cette page.</p><section><h2>Restaurants disponibles</h2><ul>${entries.slice(0, 24).map((entry) => `<li>${entry.name}</li>`).join("")}</ul></section></body></html>`;
}

function jsonScript(html: string, id: string) {
  const serialized = html.match(new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`))?.[1];
  return JSON.parse(serialized || "null");
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function cityHtml() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: 5,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "A", url: "https://www.thetok.ch/restaurants/geneve/r/a", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/a", name: "A", servesCuisine: "Italien" } },
      { "@type": "ListItem", position: 2, name: "B", url: "https://www.thetok.ch/restaurants/geneve/r/b", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/b", name: "B", servesCuisine: "Sushi" } },
      { "@type": "ListItem", position: 3, name: "Duplicate", url: "https://www.thetok.ch/restaurants/geneve/r/duplicate", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/duplicate", name: "Duplicate" } },
    ],
  };
  return `<!doctype html><html><head><meta name="robots" content="index,follow"><script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body><p>5 adresses actives sont répertoriées sur cette page.</p><section><h2>Restaurants disponibles</h2><ul><li>A — Italien</li><li>B — Sushi</li><li>Duplicate</li></ul></section></body></html>`;
}

describe("SEO inventory consistency", () => {
  it("synchronizes city counts and visible listings with final indexable restaurant routes", () => {
    const allowed = new Set([
      "/restaurants/geneve/r/a",
      "/restaurants/geneve/r/b",
      "/restaurants/geneve/r/c",
      "/restaurants/geneve/r/d",
    ]);
    const rewritten = reconcileCityInventoryHtml(cityHtml(), 4, allowed, { minimum: 3 });
    const parsed = JSON.parse(rewritten.match(/<script id="tok-page-json-ld"[^>]*>([\s\S]*?)<\/script>/)?.[1] || "null");

    expect(parsed.numberOfItems).toBe(4);
    expect(parsed.itemListElement).toHaveLength(2);
    expect(parsed.itemListElement.map((item: { position: number }) => item.position)).toEqual([1, 2]);
    expect(rewritten).toContain("4 adresses actives sont répertoriées sur cette page.");
    expect(rewritten).toContain("A — Italien");
    expect(rewritten).toContain("B — Sushi");
    expect(rewritten).not.toContain("<li>Duplicate</li>");
    expect(rewritten).toContain('content="index,follow"');
  });

  it("demotes a city that falls below the minimum only after final detail deduplication", () => {
    const allowed = new Set(["/restaurants/geneve/r/a", "/restaurants/geneve/r/b"]);
    const rewritten = reconcileCityInventoryHtml(cityHtml(), 2, allowed, { minimum: 3 });
    expect(rewritten).toContain('content="noindex,follow,noarchive"');
    expect(rewritten).toContain("2 adresses actives sont répertoriées sur cette page.");
  });

  it("uses correct singular grammar for a one-address residual city page", () => {
    const allowed = new Set(["/restaurants/geneve/r/a"]);
    const rewritten = reconcileCityInventoryHtml(cityHtml(), 1, allowed, { minimum: 3 });
    expect(rewritten).toContain("1 adresse active est répertoriée sur cette page.");
  });

  it("clears the visible city list when its last indexable restaurant disappears", () => {
    const rewritten = reconcileCityInventoryHtml(cityHtml(), 0, new Set(), { minimum: 3 });
    const itemList = jsonScript(rewritten, "tok-page-json-ld");
    expect(itemList.numberOfItems).toBe(0);
    expect(itemList.itemListElement).toEqual([]);
    expect(rewritten).toContain("0 adresses actives sont répertoriées sur cette page.");
    expect(rewritten).toContain("<h2>Restaurants disponibles</h2><ul></ul>");
    expect(rewritten).not.toContain("A — Italien");
    expect(rewritten).not.toContain("Duplicate");
    expect(rewritten).toContain('content="noindex,follow,noarchive"');
  });

  it("clears an empty city's stale visible list even if JSON-LD is missing", () => {
    const html = cityHtml().replace(/<script id="tok-page-json-ld"[^>]*>[\s\S]*?<\/script>/, "");
    const rewritten = reconcileCityInventoryHtml(html, 0, new Set());
    expect(rewritten).toContain("<h2>Restaurants disponibles</h2><ul></ul>");
    expect(rewritten).not.toContain("Duplicate");
  });

  it("synchronizes the city snapshot with the final detail inventory", () => {
    const route = "/restaurants/geneve";
    const html = localHtml("city", route, ["a", "b", "c"]);
    const rewritten = reconcileCityInventoryHtml(html, 2, allowedRestaurants(["a", "b"]), { route });
    expect(jsonScript(rewritten, "tok-local-inventory")).toMatchObject({
      path: route,
      inventoryCount: 2,
      parentInventoryCount: null,
      itemListComplete: true,
      indexable: false,
    });
  });

  it.each([
    ["cuisine", "africain"],
    ["district", "paquis"],
    ["intent", "reservation"],
  ] as const)("reconciles a %s selection that falls from three restaurants to two", (pageType, slug) => {
    const route = `/restaurants/geneve/${slug}`;
    const html = localHtml(pageType, route, ["a", "b", "c"]);
    const rewritten = reconcileSpecializedInventoryHtml(html, route, allowedRestaurants(["a", "b", "d", "e"]));
    const itemList = jsonScript(rewritten, "tok-page-json-ld");
    expect(itemList.numberOfItems).toBe(2);
    expect(itemList.itemListElement.map((entry: { position: number }) => entry.position)).toEqual([1, 2]);
    expect(rewritten).toContain("2 adresses actives sont répertoriées sur cette page.");
    expect(rewritten).not.toContain("Restaurant c");
    expect(rewritten).toContain('content="noindex,follow,noarchive"');
    expect(jsonScript(rewritten, "tok-local-inventory")).toMatchObject({
      inventoryCount: 2,
      parentInventoryCount: 4,
      indexable: false,
    });
  });

  it("empties a specialized list whose entire selection was excluded", () => {
    const route = "/restaurants/geneve/africain";
    const html = localHtml("cuisine", route, ["a", "b", "c"]);
    const rewritten = reconcileSpecializedInventoryHtml(html, route, allowedRestaurants(["d", "e"]));
    expect(jsonScript(rewritten, "tok-page-json-ld")).toMatchObject({ numberOfItems: 0, itemListElement: [] });
    expect(jsonScript(rewritten, "tok-local-inventory")).toMatchObject({
      inventoryCount: 0,
      parentInventoryCount: 2,
      indexable: false,
    });
    expect(rewritten).toContain("<h2>Restaurants disponibles</h2><ul></ul>");
    expect(rewritten).toContain("0 adresses actives sont répertoriées sur cette page.");
    expect(rewritten).not.toContain("Restaurant a");
  });

  it("demotes a three-of-five selection when the final parent shrinks to the same three restaurants", () => {
    const route = "/restaurants/geneve/africain";
    const html = localHtml("cuisine", route, ["a", "b", "c"]);
    const rewritten = reconcileSpecializedInventoryHtml(html, route, allowedRestaurants(["a", "b", "c"]));
    expect(rewritten).toContain('content="noindex,follow,noarchive"');
    expect(jsonScript(rewritten, "tok-page-json-ld")).toMatchObject({ numberOfItems: 3 });
    expect(jsonScript(rewritten, "tok-local-inventory")).toMatchObject({
      inventoryCount: 3,
      parentInventoryCount: 3,
      indexable: false,
    });
  });

  it("counts and preserves the complete specialized ItemList beyond its first hundred entries", () => {
    const route = "/restaurants/geneve/africain";
    const slugs = Array.from({ length: 125 }, (_, index) => `selection-${index}`);
    const otherSlugs = Array.from({ length: 75 }, (_, index) => `other-${index}`);
    const html = localHtml("cuisine", route, slugs, { parentInventoryCount: 200 });
    const allowed = allowedRestaurants([...slugs.slice(0, -1), ...otherSlugs]);
    const rewritten = reconcileSpecializedInventoryHtml(html, route, allowed);
    const itemList = jsonScript(rewritten, "tok-page-json-ld");
    expect(itemList.numberOfItems).toBe(124);
    expect(itemList.itemListElement).toHaveLength(124);
    expect(itemList.itemListElement.at(-1)).toMatchObject({ position: 124, name: "Restaurant selection-123" });
    expect(jsonScript(rewritten, "tok-local-inventory")).toMatchObject({
      inventoryCount: 124,
      parentInventoryCount: 199,
      indexable: true,
    });
    expect(rewritten).toContain("124 adresses actives sont répertoriées sur cette page.");
    expect(rewritten).not.toContain("Restaurant selection-124");
    expect(rewritten).toContain('content="index,follow"');
  });

  it("keeps an external noindex directive even when the final selection meets the inventory policy", () => {
    const route = "/restaurants/geneve/africain";
    const html = localHtml("cuisine", route, ["a", "b", "c"])
      .replace('<meta name="robots" content="index,follow">', '<meta content="noindex,nofollow" name="robots">');
    const rewritten = reconcileSpecializedInventoryHtml(html, route, allowedRestaurants(["a", "b", "c", "d", "e"]));
    expect(rewritten).toContain('<meta content="noindex,nofollow" name="robots">');
    expect(jsonScript(rewritten, "tok-local-inventory")).toMatchObject({ indexable: false });
  });

  it("does not promote an existing snapshot exclusion", () => {
    const route = "/restaurants/geneve/africain";
    const html = localHtml("cuisine", route, ["a", "b", "c"], { indexable: false });
    const rewritten = reconcileSpecializedInventoryHtml(html, route, allowedRestaurants(["a", "b", "c", "d", "e"]));
    expect(rewritten).toContain('content="noindex,follow,noarchive"');
    expect(jsonScript(rewritten, "tok-local-inventory")).toMatchObject({ indexable: false });
  });

  it("rejects a snapshot belonging to another local route", () => {
    const route = "/restaurants/geneve/africain";
    const html = localHtml("cuisine", route, ["a", "b", "c"], { snapshotPath: "/restaurants/lausanne/africain" });
    expect(reconcileSpecializedInventoryHtml(html, route, new Set())).toBe(html);
  });

  it.each([
    { includeSnapshot: false },
    { itemListComplete: false },
  ])("does not count a legacy or incomplete specialized ItemList: %j", (options) => {
    const route = "/restaurants/geneve/africain";
    const slugs = Array.from({ length: 100 }, (_, index) => `selection-${index}`);
    const html = localHtml("cuisine", route, slugs, {
      ...options,
      inventoryCount: 150,
      parentInventoryCount: 300,
    });
    expect(reconcileSpecializedInventoryHtml(html, route, new Set())).toBe(html);
  });

  it("removes only newly demoted city pages from the restaurant sitemap", () => {
    const xml = `<urlset><url><loc>https://www.thetok.ch/restaurants/geneve</loc></url><url><loc>https://www.thetok.ch/restaurants/lausanne</loc></url><url><loc>https://www.thetok.ch/restaurants/geneve/r/a</loc></url></urlset>`;
    const rewritten = removeDemotedCitiesFromSitemap(xml, new Set(["/restaurants/lausanne"]));
    expect(rewritten).toContain("/restaurants/geneve</loc>");
    expect(rewritten).toContain("/restaurants/geneve/r/a");
    expect(rewritten).not.toContain("/restaurants/lausanne");
  });

  it("reconciles final detail exclusions, specialized pages and the sitemap idempotently", async () => {
    const distDir = await mkdtemp(path.join(tmpdir(), "tok-seo-inventory-"));
    temporaryDirectories.push(distDir);
    const cityRoute = "/restaurants/geneve";
    const cuisineRoute = `${cityRoute}/africain`;
    const districtRoute = `${cityRoute}/paquis`;
    const intentRoute = `${cityRoute}/reservation`;
    const legacyRoute = `${cityRoute}/sushi`;
    const emptyCityRoute = "/restaurants/lausanne";
    const documents = new Map([
      [cityRoute, localHtml("city", cityRoute, ["a", "b", "c", "d", "e"])],
      [cuisineRoute, localHtml("cuisine", cuisineRoute, ["a", "b", "c"])],
      [districtRoute, localHtml("district", districtRoute, ["a", "b", "d"])],
      [intentRoute, localHtml("intent", intentRoute, ["b", "c", "e"])],
      [legacyRoute, localHtml("cuisine", legacyRoute, ["a", "b", "c"], { includeSnapshot: false, robots: "noindex,nofollow" })],
      [emptyCityRoute, localHtml("city", emptyCityRoute, ["stale"])],
      ...["a", "b", "c", "d", "e"].map((slug): [string, string] => [
        restaurantRoute(slug),
        `<html><head><meta name="robots" content="${["d", "e"].includes(slug) ? "noindex,follow" : "index,follow"}"></head><body>Restaurant ${slug}</body></html>`,
      ]),
    ]);
    const documentPath = (route: string) => path.join(distDir, route.slice(1), "index.html");
    await Promise.all([...documents].map(async ([route, html]) => {
      const filePath = documentPath(route);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, html, "utf8");
    }));
    const sitemapPath = path.join(distDir, "sitemap-restaurants.xml");
    await writeFile(sitemapPath, `<urlset>${[...documents.keys()].map((route) => `<url><loc>https://www.thetok.ch${route}</loc></url>`).join("")}</urlset>`, "utf8");

    const result = await reconcileSeoInventory({ distDir });
    expect(result).toMatchObject({
      restaurantCount: 3,
      updatedCities: 2,
      demotedCities: 1,
      updatedSpecialized: 3,
      demotedSpecialized: 3,
      skippedSpecialized: 1,
    });
    const city = await readFile(documentPath(cityRoute), "utf8");
    expect(jsonScript(city, "tok-local-inventory")).toMatchObject({ inventoryCount: 3, indexable: true });
    const cuisine = await readFile(documentPath(cuisineRoute), "utf8");
    expect(jsonScript(cuisine, "tok-local-inventory")).toMatchObject({
      inventoryCount: 3,
      parentInventoryCount: 3,
      indexable: false,
    });
    const emptyCity = await readFile(documentPath(emptyCityRoute), "utf8");
    expect(emptyCity).toContain("<h2>Restaurants disponibles</h2><ul></ul>");
    expect(emptyCity).not.toContain("Restaurant stale");
    expect(await readFile(documentPath(legacyRoute), "utf8")).toBe(documents.get(legacyRoute));

    const sitemap = await readFile(sitemapPath, "utf8");
    for (const route of [cityRoute, ...["a", "b", "c"].map(restaurantRoute)]) {
      expect(sitemap).toContain(`<loc>https://www.thetok.ch${route}</loc>`);
    }
    for (const route of [cuisineRoute, districtRoute, intentRoute, legacyRoute, emptyCityRoute, ...["d", "e"].map(restaurantRoute)]) {
      expect(sitemap).not.toContain(`<loc>https://www.thetok.ch${route}</loc>`);
    }

    const paths = [...documents.keys()].map(documentPath).concat(sitemapPath);
    const firstPass = await Promise.all(paths.map((filePath) => readFile(filePath, "utf8")));
    const repeated = await reconcileSeoInventory({ distDir });
    expect(repeated).toMatchObject({ updatedCities: 0, updatedSpecialized: 0 });
    expect(await Promise.all(paths.map((filePath) => readFile(filePath, "utf8")))).toEqual(firstPass);
  });
});
