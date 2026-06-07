import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("admin Actualites moderation state routing", () => {
  it("classifies social posts and reports by moderation status after admin actions", () => {
    const page = read("src/pages/admin/AdminActualites.tsx");
    const hook = read("src/hooks/useSocialFeed.ts");

    expect(page).toContain('type PostModerationTab = "active" | "hidden" | "deleted" | "all"');
    expect(page).toContain("POST_MODERATION_TABS");
    expect(page).toContain("filteredPosts.map");
    expect(page).toContain("setPostStatusTab(getPostModerationTab(status))");
    expect(page).toContain('handlePostModeration(row.post_id, "hidden"');

    expect(page).toContain('type ReportModerationTab = "open" | "reviewed" | "resolved" | "dismissed" | "all"');
    expect(page).toContain("REPORT_MODERATION_TABS");
    expect(page).toContain("filteredReports.map");
    expect(page).toContain("setReportStatusTab(status)");

    expect(hook).toContain("patchAdminSocialModeration");
    expect(hook).toContain('queryClient.setQueryData(["admin-social"]');
    expect(hook).toContain('queryKey: ["admin-social"]');
    expect(hook).toContain('queryKey: ["admin-actualites-sponsored"]');
  });
});
