import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { applyRestaurantRedirects } from "./apply-restaurant-redirects.mjs";

const id = "ab104c2c-ac13-4010-8062-9461733d9a4b";
const destination = "/restaurants/thonex/r/sosiji-korean-street-food";
const origin = "https://www.thetok.ch";
async function fixture(t, content = "index,follow", canonical = destination) {
  const root = await mkdtemp(path.join(tmpdir(), "tok-uuid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "dist", destination), { recursive: true });
  await writeFile(path.join(root, "dist/restaurant-aliases.json"), JSON.stringify([{ id, path: destination }]));
  await writeFile(path.join(root, "dist", destination, "index.html"), `<html><head><link href="${origin}${canonical}" rel="canonical"><meta content="${content}" name="robots"></head><body><h1>Sosiji</h1></body></html>`);
  return root;
}
test("redirects UUIDs to validated canonical public pages, preserving all query parameters", async (t) => {
  const root = await fixture(t);
  const redirects = await applyRestaurantRedirects(root);
  assert.equal(redirects.length, 2);
  await writeFile(path.join(root, ".vercel/stoppin-venue-redirects.mjs"), "export default [];\n");
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, "middleware.js"), await readFile(new URL("../middleware.js", import.meta.url)));
  const { default: middleware } = await import(pathToFileURL(path.join(root, "middleware.js")).href);
  for (const method of ["GET", "HEAD"]) for (const suffix of ["", "/"]) {
    const result = middleware(new Request(`${origin}/restaurant/${id}${suffix}?reserve=true&utm_source=test`, { method }));
    assert.equal(result.status, 301);
    assert.equal(result.headers.get("location"), origin + destination + "?reserve=true&utm_source=test");
  }
  for (const route of [`/restaurant/${id}/extra`, "/dashboard", "/auth"]) {
    assert.equal(middleware(new Request(origin + route)), undefined);
  }
  for (const method of ["GET", "HEAD"]) {
    const missing = middleware(new Request(`${origin}/restaurant/unknown`, { method }));
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("x-robots-tag"), "noindex, nofollow");
    if (method === "GET") assert.match(await missing.text(), /Restaurant introuvable/);
    else assert.equal(await missing.text(), "");
  }
  assert.equal(middleware(new Request(`${origin}/restaurant/${id}`, { method: "POST" })), undefined);
  assert.equal(await readFile(path.join(root, "dist/restaurant-aliases.json"), "utf8"), "[]\n");
});
test("excludes noindex and noncanonical destinations", async (t) => {
  assert.deepEqual(await applyRestaurantRedirects(await fixture(t, "noindex,follow")), []);
  assert.deepEqual(await applyRestaurantRedirects(await fixture(t, "index,follow", "/")), []);
});
test("rejects unsafe paths and clears stale output when inventory disappears", async (t) => {
  const root = await fixture(t); await applyRestaurantRedirects(root);
  await writeFile(path.join(root, "dist/restaurant-aliases.json"), JSON.stringify([{ id, path: "/../../private" }]));
  await assert.rejects(() => applyRestaurantRedirects(root), /Unsafe/);
  await rm(path.join(root, "dist/restaurant-aliases.json"));
  assert.deepEqual(await applyRestaurantRedirects(root), []);
  assert.equal(await readFile(path.join(root, ".vercel/restaurant-redirects.mjs"), "utf8"), "export default [];\n");
});
