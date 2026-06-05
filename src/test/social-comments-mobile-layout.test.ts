import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("social comments mobile layout", () => {
  it("keeps the comment drawer and composer usable on mobile keyboards", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/social/SocialPostCard.tsx"), "utf8");

    expect(source).toContain("shouldScaleBackground={false}");
    expect(source).toContain("max-h-[calc(100dvh-0.75rem)]");
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain");
    expect(source).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]");
    expect(source).toContain("min-w-0 flex-1 resize-none text-base sm:text-sm");
    expect(source).toContain("h-10 w-10 shrink-0");
    expect(source).not.toContain("max-h-[88vh]");
  });
});
