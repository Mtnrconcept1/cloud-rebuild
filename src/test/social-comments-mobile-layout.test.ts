import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("social comments mobile layout", () => {
  it("keeps the comment drawer and composer usable on mobile keyboards", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/social/SocialPostCard.tsx"), "utf8");
    const dashboardLayout = readFileSync(resolve(process.cwd(), "src/components/DashboardLayout.tsx"), "utf8");

    expect(source).toContain("shouldScaleBackground={false}");
    expect(source).toContain("z-[90] h-[calc(100dvh-0.75rem)]");
    expect(source).toContain("shrink-0 border-t bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3");
    expect(source).toContain("min-h-0 min-w-0 flex-1");
    expect(source).toContain("overflow-y-auto overscroll-contain");
    expect(source).toContain("pb-4");
    expect(source).toContain("min-w-0 flex-1 resize-none text-base sm:text-sm");
    expect(source).toContain("h-10 w-10 shrink-0");
    expect(source).toContain("setReplyTarget");
    expect(dashboardLayout).toContain("bottom-0 z-[40]");
    expect(source).not.toContain("max-h-[88vh]");
  });
});
