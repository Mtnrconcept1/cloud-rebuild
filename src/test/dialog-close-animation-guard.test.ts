import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dialog close behavior", () => {
  it("does not depend on closed-state CSS animations to release the page", () => {
    const source = readFileSync("src/components/ui/dialog.tsx", "utf8");

    expect(source).not.toContain("data-[state=closed]:animate-out");
    expect(source).not.toContain("data-[state=closed]:fade-out-0");
    expect(source).not.toContain("data-[state=closed]:zoom-out-95");
    expect(source).not.toContain("data-[state=closed]:slide-out-to-left-1/2");
    expect(source).not.toContain("data-[state=closed]:slide-out-to-top-[48%]");
  });
});
