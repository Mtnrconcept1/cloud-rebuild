import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("navbar action stability", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/Navbar.tsx"), "utf8");

  it("prevents mouse focus from scrolling the sticky desktop action bar", () => {
    expect(source).toContain("preserveNavbarActionScrollPosition");
    expect(source).toContain("event.detail === 0");
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("window.scrollTo(scrollX, scrollY)");
    expect(source).toContain("onMouseDown={preserveNavbarActionScrollPosition}");
    expect(source).toContain('aria-label="Mode sombre"');
    expect(source).toContain('aria-label="Notifications"');
    expect(source).toContain('aria-label="Compte"');
  });
});
