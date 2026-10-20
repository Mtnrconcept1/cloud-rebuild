import { describe, expect, it } from "vitest";
import {
  buildInstagramReply, instagramPostUrl, parseInstagramResearchRequest,
  publicEngagementRate, rankInstagramPosts, summarizeInstagramAccount,
  type InstagramPost,
} from "../../supabase/functions/_shared/marketing-instagram-research";

const post = (id: string, likes: number | null, followers: number | null): InstagramPost => ({
  id, caption: "Restaurant à Genève", url: `https://www.instagram.com/p/${id}/`,
  timestamp: "2026-10-19T12:00:00Z", username: "restaurant", followers,
  likes, comments: 10, interactions: likes === null ? null : likes + 10,
  engagementRate: publicEngagementRate(likes, 10, followers), source: "@restaurant",
  owned: false, localEvidence: "Profil ou légende : Genève et restauration/sorties",
});

describe("Instagram research contract", () => {
  it("normalizes and deduplicates bounded source lists", () => {
    expect(parseInstagramResearchRequest({ action: "instagram_discover", hashtags: ["#GeneveFood", "genevefood"], usernames: ["@ChezNous"], days: 30 }))
      .toEqual({ action: "instagram_discover", hashtags: ["genevefood"], usernames: ["cheznous"], days: 30 });
  });
  it.each([
    { action: "reply", mediaId: "123456" },
    { action: "instagram_comments", mediaId: "https://evil.test" },
    { action: "instagram_comments", mediaId: "123456", token: "secret" },
    { action: "instagram_comments", mediaId: "123456", after: "x".repeat(1025) },
    { action: "instagram_discover", hashtags: ["a", "b", "c", "d"], usernames: [], days: 30 },
    { action: "instagram_discover", hashtags: ["x){token}"], usernames: [], days: 30 },
    { action: "instagram_discover", hashtags: [], usernames: ["../me"], days: 30 },
    { action: "instagram_discover", hashtags: [], usernames: ["victim@other"], days: 30 },
    { action: "instagram_discover", hashtags: [], usernames: [], days: 999 },
  ])("rejects invalid requests and unsupported send actions: %o", (value) => {
    expect(() => parseInstagramResearchRequest(value)).toThrow();
  });
  it("does not invent a rate when counts are hidden or the denominator is absent", () => {
    expect(publicEngagementRate(90, 10, 1000)).toBe(10);
    for (const args of [[null, 10, 1000], [90, null, 1000], [90, 10, null], [90, 10, 0], [-1, 10, 1000], [NaN, 10, 1000]] as const) {
      expect(publicEngagementRate(...args)).toBeNull();
    }
    expect(publicEngagementRate(0, 0, 100)).toBe(0);
  });
  it("ranks rates separately from interaction volumes and keeps unknown values last", () => {
    const rows = [post("big", 990, 100000), post("small", 90, 1000), post("hidden", null, 100)];
    expect(rankInstagramPosts(rows, "rate").map((row) => row.id)).toEqual(["small", "big", "hidden"]);
    expect(rankInstagramPosts(rows, "interactions").map((row) => row.id)).toEqual(["big", "small", "hidden"]);
    expect(rows[0].id).toBe("big");
  });
  it("reports a median account rate with the actual public sample size", () => {
    const account = summarizeInstagramAccount("restaurant", "Chez nous", 1000, [post("one", 0, 1000), post("two", 90, 1000), post("three", 990, 1000), post("four", null, 1000)]);
    expect(account).toMatchObject({ medianEngagementRate: 10, sampledPosts: 4, measuredPosts: 3 });
  });
  it.each(["https://evil.test/p/ABC/", "https://instagram.com@evil.test/p/ABC/", "javascript:alert(1)", "https://www.instagram.com/p/ABC/?access_token=secret", "https://www.instagram.com/explore/"])("rejects unsafe or non-post links: %s", (url) => {
    expect(instagramPostUrl(url)).toBeNull();
  });
  it("accepts native post and reel URLs", () => {
    expect(instagramPostUrl("https://instagram.com/reel/Ab_C-123/")).toBe("https://www.instagram.com/reel/Ab_C-123/");
  });
  it("mentions only the selected author and uses an existing TOK destination with non-personal attribution", () => {
    const reply = buildInstagramReply("foodie.geneve", "reservation", "123456");
    expect(reply).toContain("@foodie.geneve");
    expect(reply).toContain("réserver");
    const url = new URL(reply.match(/https:\/\/\S+/)![0]);
    expect(url.origin + url.pathname).toBe("https://www.thetok.ch/recherche");
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.toString()).not.toContain("foodie");
    expect(() => buildInstagramReply("victim @other", "discovery", "123456")).toThrow();
  });
});
