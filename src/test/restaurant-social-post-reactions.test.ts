import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("restaurant social post reactions", () => {
  it("hydrates the current restaurateur reaction on dashboard posts", () => {
    const source = readFileSync(resolve(process.cwd(), "src/hooks/useSocialFeed.ts"), "utf8");

    expect(source).toContain("getViewerPostReactionsByPostId");
    expect(source).toContain(".select(\"post_id,reaction_type\")");
    expect(source).toContain(".eq(\"user_id\", viewerId)");
    expect(source).toContain("my_reaction: viewerReactionByPostId.get(row.id) || null");
    expect(source).not.toContain("myReaction: null,");
  });
});
