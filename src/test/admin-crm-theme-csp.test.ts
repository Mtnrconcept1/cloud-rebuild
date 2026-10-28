import { readFileSync } from "node:fs";

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
    expect(themeInit).toContain("new MutationObserver");
    expect(themeInit).toContain('document.documentElement.classList.remove("dark")');
  });

  it("retains the strict CSP rather than allowing inline JavaScript", () => {
    const global = vercelConfig.headers?.find((header) => header.source === "/(.*)");
    const csp = global?.headers?.find((header) => header.key === "Content-Security-Policy")?.value || "";
    const scriptSrc = csp.split(";").find((directive) => directive.trim().startsWith("script-src ")) || "";
    expect(scriptSrc).toContain("script-src 'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
