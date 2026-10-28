import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_TARGETS, runPostDeployCheck } from "../../scripts/post-deploy-check.mjs";

describe("post-deploy content rejection", () => {
  it("accepts expected content when rejected markers are absent", async () => {
    const result = await runPostDeployCheck([
      {
        url: "data:text/plain,TOK%20healthy%20SEO",
        expect: ["TOK", "SEO"],
        reject: ["moto911.com", "Monsite"],
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when a forbidden SEO regression marker is present", async () => {
    const result = await runPostDeployCheck([
      {
        url: "data:text/plain,TOK%20Monsite",
        expect: ["TOK"],
        reject: ["Monsite"],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("contains rejected content: Monsite"))).toBe(true);
  });
});

describe("post-deploy workforce entry checks", () => {
  const workforceTargets = DEFAULT_TARGETS.filter((target) => target.url.startsWith("https://www.thetok.ch/equipe/"));
  const privateHeaders = {
    "content-type": "text/html; charset=utf-8",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "cache-control": "private, no-store, max-age=0",
  };

  afterEach(() => vi.unstubAllGlobals());

  it("checks both canonical employee entry routes by default", () => {
    expect(workforceTargets.map((target) => target.url)).toEqual([
      "https://www.thetok.ch/equipe/mon-espace",
      "https://www.thetok.ch/equipe/gestion",
    ]);
  });

  it("accepts the app shell with HTTP 200 and private headers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('<div id="root"></div>', { status: 200, headers: privateHeaders })));

    expect(await runPostDeployCheck(workforceTargets)).toEqual({ ok: true, failures: [] });
  });

  it.each([
    { name: "a real HTTP 404 carrying the app shell", status: 404, html: '<div id="root"></div>', headers: privateHeaders },
    { name: "a missing-page shell disguised as HTTP 200", status: 200, html: '<title>Page introuvable | TOK</title><div id="root"></div>', headers: privateHeaders },
    { name: "missing private cache and indexing headers", status: 200, html: '<div id="root"></div>', headers: { "content-type": "text/html" } },
  ])("rejects $name", async ({ status, html, headers }) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status, headers })));

    const result = await runPostDeployCheck(workforceTargets);
    expect(result.ok).toBe(false);
    for (const target of workforceTargets) {
      expect(result.failures.some((failure) => failure.startsWith(target.url))).toBe(true);
    }
  });
});
