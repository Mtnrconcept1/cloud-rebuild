import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  headers?: Array<{
    source?: string;
    headers?: Array<{ key?: string; value?: string }>;
  }>;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

const config = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8"),
) as VercelConfig;

const PREVIEW_SCRIPT_HASHES = [
  "'sha256-B8dDVyUaq0ZHicjFqiXHTb5hUzz69+1HfIp7Sa1goac='",
  "'sha256-WSYxWIg0Mh8iqVqAKdfbvFMb19Hu5J/LhtPyv5oHwKA='",
] as const;

describe("TOK Connect MCP widget delivery", () => {
  it("serves the technical widget route through the SPA and keeps it out of search indexes", () => {
    expect(config.rewrites).toContainEqual({
      source: "/tok-connect/mcp-widget",
      destination: "/index.html",
    });

    const widgetHeaders = config.headers?.find(
      (entry) => entry.source === "/tok-connect/mcp-widget",
    )?.headers || [];

    expect(widgetHeaders).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow, noarchive",
    });
  });

  it("authorizes only the audited inline preview scripts instead of unsafe-inline", () => {
    const globalHeaders = config.headers?.find(
      (entry) => entry.source === "/(.*)",
    )?.headers || [];
    const csp = globalHeaders.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value || "";
    const scriptDirective = csp
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("script-src ")) || "";

    for (const hash of PREVIEW_SCRIPT_HASHES) {
      expect(scriptDirective).toContain(hash);
    }
    expect(scriptDirective).not.toContain("'unsafe-inline'");
  });
});
