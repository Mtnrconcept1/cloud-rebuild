import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/legal/LegalConsentBanner.tsx"), "utf8");

describe("legal consent banner layout", () => {
  it("renders the pending consent prompt as a centered white modal", () => {
    expect(source).toContain("fixed inset-0");
    expect(source).toContain("items-center justify-center");
    expect(source).toContain("bg-slate-950/45");
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("max-w-3xl");
    expect(source).toContain("bg-white");
    expect(source).not.toContain("fixed inset-x-0 bottom-0");
  });

  it("keeps the cookie settings control above the restaurateur mobile navigation", () => {
    expect(source).toContain('pathname === "/dashboard"');
    expect(source).toContain("bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]");
    expect(source).toContain("left-[calc(env(safe-area-inset-left,0px)+0.75rem)]");
    expect(source).toContain("md:bottom-4");
  });
});
