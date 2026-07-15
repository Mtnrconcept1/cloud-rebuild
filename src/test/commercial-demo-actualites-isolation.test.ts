import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd());

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function exportedFunctionSource(source: string, name: string) {
  const start = source.indexOf(`export function ${name}`);
  if (start < 0) throw new Error(`Missing exported function ${name}`);
  const next = source.indexOf("\nexport function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("commercial demo Actualites isolation", () => {
  const hooks = readProjectFile("src/hooks/useSocialFeed.ts");

  it("builds the feed, search and detail from the isolated snapshot before any production query", () => {
    expect(hooks).toContain("export function buildCommercialDemoSocialPosts");
    expect(hooks).toContain("snapshot.demo_restaurant");
    expect(hooks).toContain("snapshot.catalog_items.filter");
    expect(hooks).toContain("useSocialRealtime(!isCommercialDemoClient)");

    for (const name of ["useInfiniteSocialFeed", "useSearchActualitesPosts", "useSocialPostById", "useSocialComments"]) {
      const source = exportedFunctionSource(hooks, name);
      expect(source).toContain('commercialDemoFrame?.surface === "client"');
      expect(source.indexOf("if (isCommercialDemoClient)")).toBeGreaterThan(-1);
      const firstSupabaseCall = Math.min(
        ...[source.indexOf("supabase.rpc"), source.indexOf("supabase.from")].filter((index) => index >= 0),
      );
      expect(source.indexOf("if (isCommercialDemoClient)")).toBeLessThan(firstSupabaseCall);
    }
  });

  it("simulates every interaction used by the real social card before Supabase", () => {
    const interactionHooks = [
      "useSetSocialPostReaction",
      "useDeleteSocialPost",
      "useToggleRestaurantFollow",
      "useToggleSocialRepost",
      "useToggleSocialSave",
      "useRecordExternalShare",
      "useRecordSocialFeedEvent",
      "useSocialFeedFeedback",
      "useAddSocialComment",
      "useSetSocialCommentReaction",
      "useDeleteSocialComment",
      "useReportSocialItem",
    ];

    for (const name of interactionHooks) {
      const source = exportedFunctionSource(hooks, name);
      expect(source).toContain('commercialDemoFrame?.surface === "client"');
      expect(source.indexOf("if (isCommercialDemoClient)")).toBeGreaterThan(-1);
      const firstSupabaseCall = Math.min(
        ...[source.indexOf("supabase.rpc"), source.indexOf("supabase.from")].filter((index) => index >= 0),
      );
      if (Number.isFinite(firstSupabaseCall)) {
        expect(source.indexOf("if (isCommercialDemoClient)")).toBeLessThan(firstSupabaseCall);
      }
    }
  });

  it("disables personalized production reads, admin controls and tracking in the client frame", () => {
    const page = readProjectFile("src/pages/Actualites.tsx");
    const card = readProjectFile("src/components/social/SocialPostCard.tsx");
    const trackedCard = readProjectFile("src/components/social/TrackedSocialPostCard.tsx");
    const detail = readProjectFile("src/pages/ActualitePost.tsx");

    expect(page).toContain("const canManage = !isCommercialDemoClient");
    expect(page).toContain("if (isCommercialDemoClient || !user?.id)");
    expect(card).toContain("const canDeletePost = !isCommercialDemoClient");
    expect(trackedCard).toContain("if (!productionTrackingEnabled) return");
    expect(detail).toContain('? "noindex,nofollow"');
  });
});
