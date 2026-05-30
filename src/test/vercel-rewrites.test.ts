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
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
