import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { coordinate, dedupeVenuesByPlace, normalizedVenueName } from "./lib/stoppin-venue-dedupe.mjs";
import { applyVenueRedirects, flattenAliases, writeAliasReport } from "./apply-stoppin-venue-redirects.mjs";

const venue = (tok_slug, latitude = 46.2, longitude = 6.14, extra = {}) => ({
  id: tok_slug, tok_slug, name: "Alhambra", city_name: "Genève", latitude, longitude, ...extra,
});
const slugs = (result) => result.venues.map((entry) => entry.tok_slug);
const origin = "https://www.thetok.ch";
const page = (slug, robots = "index,follow") => `<html><head>
<link href="${origin}/restaurants-pres/${slug}" rel="canonical">
<meta content="${robots}" name="robots"></head><body>
<main data-seo-prerender="stoppin-nearby">Restaurants</main></body></html>`;

async function fixture(t, aliases = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tok-venue-seo-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = path.join(root, "dist");
  await writeAliasReport(dist, new Map(Object.entries(aliases)));
  return {
    root, dist,
    output: path.join(root, ".vercel", "stoppin-venue-redirects.json"),
    async addPage(slug, html = page(slug)) {
      const dir = path.join(dist, "restaurants-pres", slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.html"), html);
    },
  };
}

for (const invalid of [null, undefined, "", "  ", false, true, [], {}, Infinity, NaN, 91, "oops"]) {
  test(`rejects invalid latitude ${JSON.stringify(invalid)} (${typeof invalid})`, () => {
    assert.equal(coordinate(invalid, -90, 90), null);
  });
}
test("accepts zero, valid numeric strings and coordinate boundaries", () => {
  assert.equal(coordinate(0, -90, 90), 0);
  assert.equal(coordinate("46.2", -90, 90), 46.2);
  assert.equal(coordinate(-90, -90, 90), -90);
  assert.equal(coordinate(180, -180, 180), 180);
  assert.equal(coordinate(181, -180, 180), null);
});
test("preserves both ungeolocated records", () => {
  const result = dedupeVenuesByPlace([venue("a", null, null), venue("b", null, null)]);
  assert.equal(result.venues.length, 2);
  assert.equal(result.aliasToCanonical.size, 0);
});
test("merges a real duplicate across a rounding boundary", () => {
  const result = dedupeVenuesByPlace([venue("alhambra-long", 46.200249), venue("alhambra", 46.200251)]);
  assert.deepEqual(slugs(result), ["alhambra"]);
  assert.equal(result.aliasToCanonical.get("alhambra-long"), "alhambra");
});
test("does not merge diagonal points over 55 metres apart", () => {
  assert.equal(dedupeVenuesByPlace([venue("a", 46.19976, 6.13976), venue("b", 46.20024, 6.14024)]).venues.length, 2);
});
test("keeps distant same-name places and colocated differently named places", () => {
  const result = dedupeVenuesByPlace([venue("a"), venue("b", 46.52, 6.63), venue("c", 46.2, 6.14, { name: "Autre lieu" })]);
  assert.equal(result.venues.length, 3);
});
test("normalizes accents and trailing geographic suffixes, not internal words", () => {
  assert.equal(normalizedVenueName({ name: "Café Genève CH" }), "cafe");
  assert.equal(normalizedVenueName({ name: "Café Genève Nord" }), "cafe-geneve-nord");
});
test("chooses the shortest usable slug deterministically without mutating input", () => {
  const input = [venue("alhambra-geneva-ch"), venue("alhambra-geneve"), venue("alhambra")];
  const before = structuredClone(input);
  const a = dedupeVenuesByPlace(input);
  const b = dedupeVenuesByPlace([...input].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(input, before);
  assert.deepEqual(slugs(a), ["alhambra"]);
});
test("breaks equal-length slug ties lexically", () => {
  assert.deepEqual(slugs(dedupeVenuesByPlace([venue("bb"), venue("aa")])), ["aa"]);
});
test("an incomplete shorter record cannot replace a renderable place", () => {
  const result = dedupeVenuesByPlace([venue("a", 46.2, 6.14, { city_name: "" }), venue("alhambra")]);
  assert.equal(result.venues.length, 2);
  assert.equal(result.aliasToCanonical.size, 0);
});
test("does not merge transitively beyond the canonical place's 55m radius", () => {
  const result = dedupeVenuesByPlace([venue("a", 46.2), venue("bb", 46.20035), venue("ccc", 46.2007)]);
  assert.deepEqual(slugs(result), ["a", "ccc"]);
  assert.deepEqual([...result.aliasToCanonical], [["bb", "a"]]);
});
test("leaves unsafe slugs untouched instead of creating unsafe redirects", () => {
  const result = dedupeVenuesByPlace([venue("../x"), venue("alhambra")]);
  assert.equal(result.venues.length, 2);
  assert.equal(result.aliasToCanonical.size, 0);
});
test("handles an empty venue feed", () => {
  assert.deepEqual(dedupeVenuesByPlace([]), { venues: [], aliasToCanonical: new Map() });
});
test("flattens redirect chains into direct terminal destinations", () => {
  assert.deepEqual([...flattenAliases({ a: "bb", bb: "ccc" })], [["a", "ccc"], ["bb", "ccc"]]);
});
test("rejects cycles, self redirects and unsafe report entries", () => {
  for (const aliases of [{ a: "a" }, { a: "b", b: "a" }, { a: "../bad" }, { a: "https://evil.example" }, { "../x": "b" }]) {
    assert.throws(() => flattenAliases(aliases));
  }
});
test("rejects malformed manifests and refuses unreviewed redirect growth", () => {
  for (const aliases of [null, [], "x"]) assert.throws(() => flattenAliases(aliases));
  assert.throws(() => flattenAliases(Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`alias-${i}`, "canonical"]))), /1000/);
});
test("always overwrites an empty report instead of leaving stale aliases", async (t) => {
  const f = await fixture(t, { old: "canonical" });
  await writeAliasReport(f.dist, new Map());
  assert.deepEqual(JSON.parse(await readFile(path.join(f.dist, "stoppin-venue-aliases.json"), "utf8")).aliases, {});
});
test("emits a real 301 only to an indexable self-canonical HTML page", async (t) => {
  const f = await fixture(t, { old: "canonical" });
  await f.addPage("canonical");
  const redirects = await applyVenueRedirects(f.root);
  assert.deepEqual(redirects, ["/restaurants-pres/old", "/restaurants-pres/old/"].map((source) => ({ source, destination: "/restaurants-pres/canonical", statusCode: 301, caseSensitive: true, preserveQueryParams: true })));
  assert.deepEqual(JSON.parse(await readFile(f.output, "utf8")), redirects);
});
test("does not redirect to missing, noindex, refresh or noncanonical pages", async (t) => {
  const f = await fixture(t, { a: "missing", b: "hidden", c: "other", d: "refresh" });
  await f.addPage("hidden", page("hidden", "noindex,follow"));
  await f.addPage("other", page("different"));
  await f.addPage("refresh", page("refresh").replace("</head>", '<meta http-equiv="refresh" content="0;url=/ailleurs"></head>'));
  assert.deepEqual(await applyVenueRedirects(f.root), []);
});
test("respects a googlebot noindex instruction regardless of attribute order", async (t) => {
  const f = await fixture(t, { old: "canonical" });
  await f.addPage("canonical", page("canonical").replace("</head>", "<meta content='noindex' name='googlebot'></head>"));
  assert.deepEqual(await applyVenueRedirects(f.root), []);
});
test("removes redirected stale HTML and alias sitemap entries, not unrelated content", async (t) => {
  const f = await fixture(t, { old: "canonical" });
  await f.addPage("old"); await f.addPage("canonical"); await f.addPage("unrelated");
  const sitemap = path.join(f.dist, "sitemap-restaurants-stoppin-1.xml");
  await writeFile(sitemap, `<urlset><url><loc>${origin}/restaurants-pres/old</loc></url><url><loc>${origin}/restaurants-pres/canonical</loc></url></urlset>`);
  await applyVenueRedirects(f.root);
  await assert.rejects(readFile(path.join(f.dist, "restaurants-pres/old/index.html")), { code: "ENOENT" });
  assert.ok(await readFile(path.join(f.dist, "restaurants-pres/unrelated/index.html")));
  const xml = await readFile(sitemap, "utf8");
  assert.ok(!xml.includes("/restaurants-pres/old"));
  assert.ok(xml.includes("/restaurants-pres/canonical"));
});
test("a missing manifest replaces stale output with an empty redirect list", async (t) => {
  const f = await fixture(t, { old: "canonical" });
  await f.addPage("canonical"); await applyVenueRedirects(f.root);
  await rm(path.join(f.dist, "stoppin-venue-aliases.json"));
  assert.deepEqual(await applyVenueRedirects(f.root), []);
  assert.equal(await readFile(f.output, "utf8"), "[]\n");
});
test("a malformed manifest fails the build before deleting existing HTML", async (t) => {
  const f = await fixture(t);
  await f.addPage("old");
  await writeFile(path.join(f.dist, "stoppin-venue-aliases.json"), "{broken");
  await assert.rejects(applyVenueRedirects(f.root));
  assert.ok(await readFile(path.join(f.dist, "restaurants-pres/old/index.html")));
});
test("repeated finalization is idempotent", async (t) => {
  const f = await fixture(t, { old: "canonical" });
  await f.addPage("canonical");
  const first = await applyVenueRedirects(f.root);
  assert.deepEqual(await applyVenueRedirects(f.root), first);
});
test("the actual two-URL redirect budget is checked before deleting alias HTML", async (t) => {
  const aliases = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`alias-${i}`, "canonical"]));
  const f = await fixture(t, aliases);
  await f.addPage("canonical"); await f.addPage("alias-0");
  await assert.rejects(applyVenueRedirects(f.root), /1000-rule budget/);
  assert.ok(await readFile(path.join(f.dist, "restaurants-pres/alias-0/index.html")));
});
