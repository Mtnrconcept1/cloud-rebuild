import { describe, expect, it, vi } from "vitest";
import {
  MarketingSocialInputError,
  parseMarketingSocialFollowEnvelope,
  parseMarketingSocialFollowRequest,
} from "../../supabase/functions/_shared/marketing-social-follow-contract";
import {
  createMarketingSocialFollowHandler,
  type MarketingSocialFollowDependencies,
} from "../../supabase/functions/_shared/marketing-social-follow-handler";
import { canonicalizeSocialProfileUrl } from "../../supabase/functions/_shared/marketing-social-profile";

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const PROFILE = "22222222-2222-4222-8222-222222222222";
const LEASE = "33333333-3333-4333-8333-333333333333";
const proofs = { sessionHash: "a".repeat(64), csrfHash: "b".repeat(64) };
const progress = { eligibleRestaurants: 5, totalJobs: 5, pending: 0, processing: 0, completed: 5,
  success: 3, noProfiles: 1, noWebsite: 1, robotsBlocked: 0, errors: 0, profiles: 3, hasMore: false };
const record = { action: "record", profileId: PROFILE, followStatus: "requested", verificationStatus: "verified",
  expectedVersion: 0, expectedSourceAccountId: "17841447348180505", confirmedWithTokAccount: true, note: "Demande envoyée." };
const body = (request: unknown, envelope: Record<string, unknown> = {}) => ({ request, ...proofs, ...envelope });
const request = (payload: unknown, signal?: AbortSignal) => new Request("https://project.supabase.co/functions/v1/marketing-social-follow", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), ...(signal ? { signal } : {}),
});

function harness() {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>, _signal: AbortSignal): Promise<{ data: unknown; error: { code?: string; message?: string; details?: string } | null }> => {
    if (args.p_operation === "claim") return { data: { jobs: [], collection: progress }, error: null };
    if (args.p_operation === "progress") return { data: progress, error: null };
    return { data: { ok: true }, error: null };
  });
  const authenticate = vi.fn(async () => ({ authMode: "service_role", isServiceRole: true, rpc }));
  const crawl = vi.fn<MarketingSocialFollowDependencies["crawl"]>(async () => ({
    profiles: [], crawlStatus: "no_profiles", visitedUrls: [], diagnostics: [], networkAttempted: false,
  }));
  const dependencies: MarketingSocialFollowDependencies = { authenticate, canonicalize: canonicalizeSocialProfileUrl, crawl };
  return { rpc, authenticate, crawl, dependencies, handle: createMarketingSocialFollowHandler(dependencies) };
}

describe("closed social-follow contract", () => {
  it("normalizes bounded defaults and accepts a note for manual provenance", () => {
    expect(parseMarketingSocialFollowRequest({ action: "collect" })).toEqual({ action: "collect", limit: 3, restaurantId: null });
    expect(parseMarketingSocialFollowRequest({ action: "restaurants" })).toEqual({ action: "restaurants", query: "", limit: 20, offset: 0 });
    expect(parseMarketingSocialFollowRequest({ action: "add", restaurantId: RESTAURANT, profileUrl: "https://instagram.com/cafe.alpha", note: " À vérifier. " }))
      .toMatchObject({ sourceUrl: null, note: "À vérifier." });
    expect(parseMarketingSocialFollowEnvelope(body({ action: "list" }))).toMatchObject({ ...proofs, request: { action: "list", limit: 20, offset: 0 } });
  });

  it.each([
    { action: "claim", limit: 1 }, { action: "complete", leaseToken: LEASE }, { action: "open", profileId: PROFILE },
    { action: "collect", limit: 4 }, { action: "collect", website: "http://127.0.0.1/" },
    { action: "collect", restaurantId: "not-an-id" }, { action: "list", limit: 1000 },
    { action: "list", offset: -1 }, { action: "list", sessionHash: proofs.sessionHash },
    { action: "add", restaurantId: RESTAURANT, profileUrl: "javascript:alert(1)" },
    { action: "add", restaurantId: RESTAURANT, profileUrl: "https://user:pass@instagram.com/cafe/" },
    { ...record, expectedVersion: -1 }, { ...record, expectedSourceAccountId: "TOK" },
    { ...record, confirmedWithTokAccount: false }, { ...record, verificationStatus: "needs_review" },
    { ...record, note: "x".repeat(501) },
  ])("rejects unsafe or internal request %#", (value) => {
    expect(() => parseMarketingSocialFollowRequest(value)).toThrow(MarketingSocialInputError);
  });

  it.each([
    body({ action: "list" }, { csrfHash: null }), body({ action: "list" }, { sessionHash: "A".repeat(64) }),
    body({ action: "list" }, { actorId: "forged" }), { action: "list", p_sid_hash: proofs.sessionHash, p_csrf_hash: proofs.csrfHash },
  ])("rejects forged or noncanonical server envelopes %#", (value) => {
    expect(() => parseMarketingSocialFollowEnvelope(value)).toThrow(MarketingSocialInputError);
  });

  it("preserves the requested state independently of a followed state", () => {
    expect(parseMarketingSocialFollowRequest(record)).toMatchObject({ followStatus: "requested", expectedVersion: 0 });
    expect(parseMarketingSocialFollowRequest({ ...record, followStatus: "followed" })).toMatchObject({ followStatus: "followed" });
  });
});

describe("social-follow Edge service boundary", () => {
  it.each(["user_jwt", "scheduler_secret"])("rejects %s before SQL or crawling", async (authMode) => {
    const test = harness(); test.authenticate.mockResolvedValue({ authMode, isServiceRole: authMode === "scheduler_secret", rpc: test.rpc });
    const result = await test.handle(request(body({ action: "collect" })));
    expect(result.status).toBe(403); expect(test.rpc).not.toHaveBeenCalled(); expect(test.crawl).not.toHaveBeenCalled();
  });

  it("keeps an invalid server key separate from an expired user session", async () => {
    const test = harness(); test.authenticate.mockRejectedValue(Object.assign(new Error("secret-key-rejected"), { status: 401 }));
    const result = await test.handle(request(body({ action: "list" })));
    expect(result.status).toBe(503); expect(await result.json()).toMatchObject({ error: { code: "service_unavailable" } });
    expect(test.rpc).not.toHaveBeenCalled();
  });

  it("rejects arbitrary collection inputs and oversized bodies before calling SQL", async () => {
    const test = harness();
    for (const payload of [body({ action: "collect", websiteUrl: "http://169.254.169.254/" }), body({ action: "list" }, { padding: "x".repeat(20_000) })]) {
      const result = await test.handle(request(payload)); expect(result.status).toBe(400);
    }
    expect(test.rpc).not.toHaveBeenCalled(); expect(test.crawl).not.toHaveBeenCalled();
  });

  it("normalizes and stores manual links without fetching them", async () => {
    const test = harness();
    const result = await test.handle(request(body({ action: "add", restaurantId: RESTAURANT,
      profileUrl: "https://m.facebook.com/pages/Cafe-Alpha/123456789?utm_source=website", sourceUrl: "https://restaurant.example/contact", note: "Adresse à vérifier." })));
    expect(result.status).toBe(200); expect(test.crawl).not.toHaveBeenCalled();
    expect(test.rpc.mock.calls[0][1]).toEqual({ p_sid_hash: proofs.sessionHash, p_csrf_hash: proofs.csrfHash, p_operation: "add",
      p_args: { restaurantId: RESTAURANT, candidate: { platform: "facebook", canonicalKey: "id:123456789",
        url: "https://www.facebook.com/profile.php?id=123456789", sourceUrl: "https://restaurant.example/contact", sourceKind: "manual", context: "Adresse à vérifier." } } });
  });

  it.each(["https://facebook.com/sharer.php?u=https://restaurant.example", "https://instagram.com/p/abc", "https://evil.example/cafe"])("rejects non-profile add URL %s", async (profileUrl) => {
    const test = harness();
    const result = await test.handle(request(body({ action: "add", restaurantId: RESTAURANT, profileUrl })));
    expect(result.status).toBe(400); expect(await result.json()).toMatchObject({ error: { code: "social_follow_invalid_profile" } });
    expect(test.rpc).not.toHaveBeenCalled(); expect(test.crawl).not.toHaveBeenCalled();
  });

  it("forwards an observation with mandatory actor and version without changing its status", async () => {
    const test = harness(); await test.handle(request(body(record)));
    expect(test.rpc.mock.calls[0][1]).toMatchObject({ p_operation: "record", p_args: {
      followStatus: "requested", verificationStatus: "verified", expectedVersion: 0, expectedSourceAccountId: "17841447348180505", confirmedWithTokAccount: true,
    } });
    expect(test.crawl).not.toHaveBeenCalled();
  });

  it.each([
    ["authentication_required", 401], ["forbidden", 403], ["social_follow_conflict", 409], ["social_follow_account_changed", 409],
    ["social_follow_account_unavailable", 409], ["social_follow_collection_busy", 429],
  ])("maps the allowlisted SQL error %s", async (message, status) => {
    const test = harness(); test.rpc.mockResolvedValue({ data: null, error: { message: String(message), details: "900" } });
    const result = await test.handle(request(body({ action: "collect" })));
    expect(result.status).toBe(status); expect(await result.json()).toMatchObject({ error: { code: message,
      ...(status === 429 ? { retryAfterSeconds: 900 } : {}) } }); expect(test.crawl).not.toHaveBeenCalled();
  });

  it("redacts unexpected SQL or provider errors", async () => {
    const test = harness(); test.rpc.mockResolvedValue({ data: null, error: { message: "credential-sensitive-test-marker", details: "raw SQL" } });
    const result = await test.handle(request(body({ action: "list" })));
    expect(result.status).toBe(503); expect(await result.text()).not.toMatch(/credential-sensitive-test-marker|raw SQL/);
  });

  it("collects at most three database-owned sites and revalidates the session on every operation", async () => {
    const test = harness(); let index = 0;
    test.rpc.mockImplementation(async (_name, args) => {
      if (args.p_operation === "claim") return { data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE,
        websiteUrl: `https://restaurant${++index}.example/`, instagramUrl: null, facebookUrl: null }], collection: progress }, error: null };
      if (args.p_operation === "complete") return { data: { discovered: 0, deduplicated: 0, profilesFound: 0 }, error: null };
      return { data: progress, error: null };
    });
    const result = await test.handle(request(body({ action: "collect" })));
    expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ processed: 3, hasMore: false, collection: progress });
    expect(test.crawl).toHaveBeenCalledTimes(3); expect(test.crawl.mock.calls.map((call) => call[0]))
      .toEqual(["https://restaurant1.example/", "https://restaurant2.example/", "https://restaurant3.example/"]);
    expect(test.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual(["claim", "complete", "claim", "complete", "claim", "complete", "progress"]);
    for (const call of test.rpc.mock.calls) expect(call[1]).toMatchObject({ p_sid_hash: proofs.sessionHash, p_csrf_hash: proofs.csrfHash });
    for (const call of test.crawl.mock.calls) expect(call[1].budgetMs).toBeLessThanOrEqual(12_000);
  });

  it("keeps database links with no website as unverified candidates and never infers absence of a social account", async () => {
    const test = harness();
    test.rpc.mockImplementation(async (_name, args) => {
      if (args.p_operation === "claim") return { data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE, websiteUrl: null,
        instagramUrl: "https://instagram.com/stoppin_gva", facebookUrl: "https://facebook.com/sharer.php" }] }, error: null };
      if (args.p_operation === "complete") return { data: { discovered: 1, deduplicated: 0, profilesFound: 1 }, error: null };
      return { data: progress, error: null };
    });
    test.crawl.mockResolvedValue({ profiles: [], crawlStatus: "no_website", visitedUrls: [], diagnostics: [], networkAttempted: false });
    const result = await test.handle(request(body({ action: "collect", restaurantId: RESTAURANT })));
    expect(await result.json()).toMatchObject({ processed: 1, discovered: 1, results: [{ status: "no_website", profilesFound: 1 }] });
    const completion = test.rpc.mock.calls.find((call) => call[1].p_operation === "complete")![1].p_args;
    expect(completion).toMatchObject({ profiles: [{ canonicalKey: "stoppin_gva", sourceKind: "database" }], diagnostics: ["database_facebook_invalid"] });
    expect(JSON.stringify(completion)).not.toMatch(/followed|verificationStatus|confirmed/);
    expect(test.crawl).toHaveBeenCalledOnce();
  });

  it("deduplicates matching database and website candidates while preserving website provenance", async () => {
    const test = harness();
    test.rpc.mockImplementation(async (_name, args) => {
      if (args.p_operation === "claim") return { data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE,
        websiteUrl: "https://restaurant.example/", instagramUrl: "https://instagram.com/CAFE", facebookUrl: null }] }, error: null };
      if (args.p_operation === "complete") return { data: { discovered: 1, deduplicated: 0, profilesFound: 1 }, error: null };
      return { data: progress, error: null };
    });
    test.crawl.mockResolvedValue({ profiles: [{ platform: "instagram", canonicalKey: "cafe", url: "https://www.instagram.com/cafe/",
      sourceUrl: "https://restaurant.example/contact", context: "Instagram du restaurant" }], crawlStatus: "success", visitedUrls: ["https://restaurant.example/contact"], diagnostics: [], networkAttempted: true });
    await test.handle(request(body({ action: "collect", restaurantId: RESTAURANT })));
    const completion = test.rpc.mock.calls.find((call) => call[1].p_operation === "complete")![1].p_args as { profiles: unknown[] };
    expect(completion.profiles).toHaveLength(1); expect(completion.profiles[0]).toMatchObject({ sourceKind: "website", sourceUrl: "https://restaurant.example/contact" });
  });

  it("returns durable partial progress when the time budget prevents another site", async () => {
    const test = harness(); let time = 0; test.dependencies.now = () => time;
    test.rpc.mockImplementation(async (_name, args) => {
      if (args.p_operation === "claim") return { data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE, websiteUrl: null }] }, error: null };
      if (args.p_operation === "complete") { time = 40_000; return { data: { discovered: 0, deduplicated: 0, profilesFound: 0 }, error: null }; }
      return { data: { ...progress, hasMore: true }, error: null };
    });
    const result = await createMarketingSocialFollowHandler(test.dependencies)(request(body({ action: "collect" })));
    expect(await result.json()).toMatchObject({ processed: 1, hasMore: true }); expect(test.crawl).toHaveBeenCalledOnce();
  });

  it("stops if the session is revoked between claim and completion", async () => {
    const test = harness();
    test.rpc.mockImplementation(async (_name, args) => args.p_operation === "claim"
      ? { data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE, websiteUrl: null }] }, error: null }
      : { data: null, error: { message: "authentication_required" } });
    const result = await test.handle(request(body({ action: "collect" })));
    expect(result.status).toBe(401); expect(test.crawl).toHaveBeenCalledOnce();
    expect(test.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual(["claim", "complete"]);
  });

  it("leaves a lease recoverable when the client aborts during the crawl", async () => {
    const test = harness(); const abort = new AbortController();
    test.rpc.mockResolvedValue({ data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE, websiteUrl: "https://restaurant.example/" }] }, error: null });
    test.crawl.mockImplementation(async () => { abort.abort(); throw new Error("cancelled"); });
    const result = await test.handle(request(body({ action: "collect" }), abort.signal));
    expect(result.status).toBe(503); expect(test.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual(["claim"]);
  });

  it("binds every origin reservation and finish to the authenticated restaurant lease", async () => {
    const test = harness(); const nextAllowedAt = new Date(Date.now() + 20_000).toISOString();
    test.rpc.mockImplementation(async (_name, args) => {
      if (args.p_operation === "claim") return { data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE, websiteUrl: "https://restaurant.example/" }] }, error: null };
      if (args.p_operation === "reserve_origin") return { data: { kind: "reserved", requestToken: PROFILE }, error: null };
      if (args.p_operation === "finish_origin") return { data: { nextAllowedAt }, error: null };
      if (args.p_operation === "complete") return { data: { discovered: 0, deduplicated: 0, profilesFound: 0 }, error: null };
      return { data: progress, error: null };
    });
    test.crawl.mockImplementation(async (_website, options) => {
      const reservation = await options.originCoordinator!.reserve({ origin: "https://restaurant.example", kind: "robots", signal: options.signal });
      expect(reservation).toMatchObject({ kind: "reserved", requestToken: PROFILE });
      await options.originCoordinator!.finish({ origin: "https://restaurant.example", requestToken: PROFILE,
        robotsPolicy: { rules: [], crawlDelayMs: 20_000, denyAll: false }, signal: options.signal });
      return { profiles: [], crawlStatus: "error", visitedUrls: [], diagnostics: ["crawl_delay_deferred"], retryAfter: nextAllowedAt, networkAttempted: true };
    });
    const result = await test.handle(request(body({ action: "collect", restaurantId: RESTAURANT })));
    expect(result.status).toBe(200);
    expect(test.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual(["claim", "reserve_origin", "finish_origin", "complete", "progress"]);
    for (const operation of ["reserve_origin", "finish_origin"]) {
      expect(test.rpc.mock.calls.find((call) => call[1].p_operation === operation)![1]).toMatchObject({ p_sid_hash: proofs.sessionHash,
        p_csrf_hash: proofs.csrfHash, p_args: { restaurantId: RESTAURANT, leaseToken: LEASE, origin: "https://restaurant.example" } });
    }
  });

  it("awaits bounded origin cleanup after cancellation and preserves long server retries", async () => {
    const test = harness(); const abort = new AbortController(); let cleaned = false;
    test.rpc.mockImplementation(async (_name, args) => {
      if (args.p_operation === "claim") return { data: { jobs: [{ restaurantId: RESTAURANT, leaseToken: LEASE, websiteUrl: "https://restaurant.example/" }] }, error: null };
      if (args.p_operation === "finish_origin") { cleaned = true; return { data: { nextAllowedAt: new Date(Date.now() + 14 * 86400_000).toISOString() }, error: null }; }
      throw new Error("Unexpected operation after cancellation");
    });
    test.crawl.mockImplementation(async (_website, options) => {
      abort.abort();
      await options.originCoordinator!.finish({ origin: "https://restaurant.example", requestToken: PROFILE,
        retryAfter: new Date(Date.now() + 14 * 86400_000).toISOString(), signal: new AbortController().signal });
      return { profiles: [], crawlStatus: "error", visitedUrls: [], diagnostics: ["crawl_cancelled"], networkAttempted: true };
    });
    const result = await test.handle(request(body({ action: "collect" }), abort.signal));
    expect(result.status).toBe(503); expect(cleaned).toBe(true);
    expect(test.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual(["claim", "finish_origin"]);
    const busy = harness(); busy.rpc.mockResolvedValue({ data: null, error: { message: "social_follow_collection_busy", details: "1209600" } });
    const deferred = await busy.handle(request(body({ action: "collect" })));
    expect(deferred.headers.get("Retry-After")).toBe("1209600");
    expect(await deferred.json()).toMatchObject({ error: { retryAfterSeconds: 1209600 } });
  });
});
