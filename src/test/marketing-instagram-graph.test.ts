import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInstagramResearch } from "../../supabase/functions/_shared/marketing-instagram-graph";

vi.stubGlobal("crypto", webcrypto);

const config = { graphVersion: "v26.0", pageId: "123456", instagramUserId: "654321", systemUserToken: "private-system-token", appSecret: "private-app-secret" };
const now = Date.parse("2026-10-20T12:00:00Z");
const media = (id: string, caption = "Bon restaurant à Genève", extra = {}) => ({ id, caption, timestamp: "2026-10-19T12:00:00Z", permalink: `https://www.instagram.com/p/ABC${id}/`, like_count: 90, comments_count: 10, ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function graph(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/123456")) return json({ id: "123456", instagram_business_account: { id: "654321" } });
    if (url.pathname.endsWith("/654321") && url.searchParams.get("fields")?.startsWith("business_discovery")) return json({ business_discovery: { id: "999999", username: "bistrot", name: "Bistrot Genève", biography: "Cuisine à Genève", followers_count: 1000, media: { data: [media("333333")], paging: { next: "https://evil.test/token" } } } });
    if (url.pathname.endsWith("/654321")) return json({ id: "654321", username: "tok_suisse", followers_count: 2000 });
    if (url.pathname.endsWith("/654321/media")) return json({ data: [media("111111"), media("222222", "Paris restaurant"), media("999999", "Genève restaurant", { timestamp: "2024-01-01T12:00:00Z" })] });
    if (url.pathname.endsWith("/ig_hashtag_search")) return json({ data: [{ id: "777777" }] });
    if (url.pathname.endsWith("/777777/top_media")) return json({ data: [media("444444")], ...overrides });
    if (url.pathname.endsWith("/111111")) return json({ id: "111111", owner: { id: "654321" }, permalink: "https://www.instagram.com/p/ABC111111/" });
    if (url.pathname.endsWith("/111111/comments")) return json({ data: [
      { id: "222222", username: "foodie", text: "Où réserver ?", like_count: 20, timestamp: "2026-10-20T11:00:00Z" },
      { id: "333333", username: "client", text: "Belle table", like_count: 40, timestamp: "2026-10-20T11:00:00Z" },
    ], paging: { next: "https://evil.test?access_token=SECRET", cursors: { after: "opaque-cursor" } } });
    throw new Error(`Unexpected fixture path: ${url.pathname}`);
  });
}
afterEach(() => vi.restoreAllMocks());
describe("read-only Instagram Graph research", () => {
  it("discovers professional account candidates from observed local caption mentions", async () => {
    const result = await runInstagramResearch(config, { action: "instagram_discover", hashtags: ["genevefood"], usernames: [], days: 30 }, {
      fetchImpl: graph({ data: [media("444444", "Bon restaurant à Genève @bistrot")] }), now: () => now,
    });
    expect(result.kind === "discovery" && result.accounts.some((row) => row.username === "bistrot")).toBe(true);
  });
  it("discovers public posts, filters Geneva and dates, and distinguishes unknown hashtag rates", async () => {
    const fetchImpl = graph();
    const result = await runInstagramResearch(config, { action: "instagram_discover", hashtags: ["genevefood"], usernames: ["bistrot"], days: 30 }, { fetchImpl, now: () => now });
    expect(result.kind).toBe("discovery");
    if (result.kind !== "discovery") return;
    expect(result.posts.map((row) => row.id)).toEqual(expect.arrayContaining(["111111", "333333", "444444"]));
    expect(result.posts.map((row) => row.id)).not.toEqual(expect.arrayContaining(["222222", "999999"]));
    expect(result.posts.find((row) => row.id === "444444")).toMatchObject({ followers: null, engagementRate: null, username: null });
    expect(result.accounts.find((row) => row.username === "bistrot")).toMatchObject({ followers: 1000, medianEngagementRate: 10 });
    expect(result.truncatedSources).toContain("@bistrot");
    for (const [input, init] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://graph.facebook.com");
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(url.searchParams.get("appsecret_proof")).toMatch(/^[a-f0-9]{64}$/);
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
    }
    expect(JSON.stringify(result)).not.toMatch(/private-system-token|private-app-secret|evil.test/);
  });
  it("keeps partial results when one source is denied", async () => {
    const base = graph();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("ig_hashtag_search")) return json({ error: { code: 10, message: config.systemUserToken } }, 403);
      return base(input, init);
    });
    const result = await runInstagramResearch(config, { action: "instagram_discover", hashtags: ["genevefood"], usernames: [], days: 30 }, { fetchImpl, now: () => now });
    expect(result.kind === "discovery" && result.posts.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).toContain("instagram_access_required");
    expect(JSON.stringify(result)).not.toContain(config.systemUserToken);
  });
  it("rejects a changed Instagram identity before accessing content", async () => {
    const fetchImpl = vi.fn(async () => json({ id: "123456", instagram_business_account: { id: "999999" } }));
    await expect(runInstagramResearch(config, { action: "instagram_comments", mediaId: "111111" }, { fetchImpl })).rejects.toThrow("instagram_identity_mismatch");
  });
  it("checks media ownership before reading and ranking comments, and returns only an opaque pagination cursor", async () => {
    const result = await runInstagramResearch(config, { action: "instagram_comments", mediaId: "111111" }, { fetchImpl: graph(), now: () => now });
    expect(result.kind).toBe("comments");
    if (result.kind !== "comments") return;
    expect(result.comments.map((row) => row.username)).toEqual(["client", "foodie"]);
    expect(result.nextCursor).toBe("opaque-cursor");
    expect(JSON.stringify(result)).not.toContain("evil.test");
  });
  it("refuses comments on third-party media", async () => {
    const base = graph();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => String(input).includes("/111111?")
      ? json({ id: "111111", owner: { id: "999999" } }) : base(input, init));
    await expect(runInstagramResearch(config, { action: "instagram_comments", mediaId: "111111" }, { fetchImpl })).rejects.toThrow("instagram_external_comments_manual");
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/comments"))).toBe(false);
  });
  it("does not follow provider pagination URLs or accept oversized responses", async () => {
    const base = graph();
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => String(input).includes("/111111/comments")
      ? new Response("x".repeat(400001)) : base(input, init));
    await expect(runInstagramResearch(config, { action: "instagram_comments", mediaId: "111111" }, { fetchImpl })).rejects.toThrow("instagram_response_invalid");
  });
});
