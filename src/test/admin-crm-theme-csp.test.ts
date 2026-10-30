import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const themeInit = readFileSync("public/theme-preference-init.js", "utf8");
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  headers?: Array<{
    source?: string;
    headers?: Array<{ key?: string; value?: string }>;
  }>;
};

describe("CRM authentication CSP regression", () => {
  it("loads theme initialization from a first-party file, not an inline script", () => {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    expect(parsed.querySelector('script[src="/theme-preference-init.js"]')).not.toBeNull();
    const inlineScripts = Array.from(parsed.querySelectorAll("script")).filter(
      (script) => !script.hasAttribute("src") && Boolean(script.textContent?.trim()),
    );
    expect(inlineScripts).toHaveLength(0);
    expect(themeInit).toContain('root.classList.add("tok-app-booting")');
    expect(themeInit).not.toContain("new MutationObserver");
  });

  it.each([
    ["light", true, false],
    ["dark", false, true],
    [null, true, true],
    [null, false, false],
  ])("applies the %s preference once and never competes with Halloween", (storedTheme, systemDark, expectedDark) => {
    const classes = new Set(["dark"]);
    let observerCount = 0;

    runInNewContext(themeInit, {
      document: {
        documentElement: {
          classList: {
            add: (value: string) => classes.add(value),
            toggle: (value: string, force: boolean) => {
              if (force) classes.add(value);
              else classes.delete(value);
            },
          },
        },
      },
      window: {
        localStorage: { getItem: () => storedTheme },
        matchMedia: () => ({ matches: systemDark }),
      },
      MutationObserver: class {
        constructor() { observerCount += 1; }
        observe() {}
      },
    });

    expect(classes.has("tok-app-booting")).toBe(true);
    expect(classes.has("dark")).toBe(expectedDark);
    // A persistent boot observer previously fought Halloween's dark-mode observer
    // and could lock up the browser when the saved choice was light.
    expect(observerCount).toBe(0);
  });

  it("uses system colors safely when localStorage is inaccessible", () => {
    const classes = new Set<string>();
    expect(() => runInNewContext(themeInit, {
      document: {
        documentElement: {
          classList: {
            add: (value: string) => classes.add(value),
            toggle: (value: string, force: boolean) => {
              if (force) classes.add(value);
              else classes.delete(value);
            },
          },
        },
      },
      window: {
        localStorage: { getItem: () => { throw new Error("storage blocked"); } },
        matchMedia: () => ({ matches: true }),
      },
    })).not.toThrow();
    expect(classes.has("dark")).toBe(true);
  });

  it("retains the strict CSP rather than allowing inline JavaScript", () => {
    const global = vercelConfig.headers?.find((header) => header.source === "/(.*)");
    const csp = global?.headers?.find((header) => header.key === "Content-Security-Policy")?.value || "";
    const scriptSrc = csp.split(";").find((directive) => directive.trim().startsWith("script-src ")) || "";
    expect(scriptSrc).toContain("script-src 'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
