import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ marketingBffRequest: request }));
import {
  addSocialFollowProfile,
  collectSocialFollowProfiles,
  listSocialFollowProfiles,
  listSocialFollowRestaurants,
  recordSocialFollow,
  socialFollowStatusForAccount,
  socialProfileHref,
  socialSourceHref,
} from "@/marketing/socialFollowClient";
import { SOCIAL_ACCOUNT_ID, SOCIAL_PROFILE_ID, SOCIAL_RESTAURANT_ID, socialCollect, socialList, socialProfile, socialRestaurant } from "./marketing-social-follow-fixtures";

const listInput = { query: "", platform: "all" as const, status: "all" as const, limit: 20, offset: 0 };
const recordInput = { profileId: SOCIAL_PROFILE_ID, followStatus: "followed" as const, verificationStatus: "verified" as const, expectedVersion: 0, expectedSourceAccountId: SOCIAL_ACCOUNT_ID, confirmedWithTokAccount: true, note: "Contrôlé avec TOK" };

describe("social follow browser client", () => {
  beforeEach(() => request.mockReset());

  it("uses the authenticated same-origin BFF and forwards cancellation on both paginated reads", async () => {
    const controller = new AbortController();
    request.mockResolvedValueOnce(socialList()).mockResolvedValueOnce({ items: [socialRestaurant()], total: 1 });
    await listSocialFollowProfiles(listInput, controller.signal);
    await listSocialFollowRestaurants({ query: "Genève", limit: 20, offset: 20 }, controller.signal);
    expect(request).toHaveBeenNthCalledWith(1, "/api/marketing/social-follow", expect.objectContaining({ body: { action: "list", ...listInput }, requireCsrf: true, signal: controller.signal, timeoutMs: 50_000 }));
    expect(request).toHaveBeenNthCalledWith(2, "/api/marketing/social-follow", expect.objectContaining({ body: { action: "restaurants", query: "Genève", limit: 20, offset: 20 }, requireCsrf: true, signal: controller.signal, timeoutMs: 50_000 }));
  });

  it("collects at most three restaurants and never sends a website URL from the browser", async () => {
    request.mockResolvedValue(socialCollect());
    const controller = new AbortController();
    await collectSocialFollowProfiles(SOCIAL_RESTAURANT_ID, controller.signal);
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/marketing/social-follow", {
      body: { action: "collect", limit: 3, restaurantId: SOCIAL_RESTAURANT_ID }, requireCsrf: true, signal: controller.signal, timeoutMs: 95_000,
    });
  });

  it("fails closed on malformed or missing backend data instead of inventing an empty queue", async () => {
    request.mockResolvedValueOnce({}).mockResolvedValueOnce({ ...socialList(), counts: { unknown: "1" } });
    await expect(listSocialFollowProfiles(listInput)).rejects.toThrow("réponse du suivi social est incomplète");
    await expect(listSocialFollowProfiles(listInput)).rejects.toThrow("réponse du suivi social est incomplète");
  });

  it.each(["requested", "followed"] as const)("requires verified identity and an explicit TOK confirmation for %s", async (followStatus) => {
    await expect(recordSocialFollow({ ...recordInput, followStatus, confirmedWithTokAccount: false })).rejects.toThrow("Confirmez l’identité");
    await expect(recordSocialFollow({ ...recordInput, followStatus, verificationStatus: "rejected" })).rejects.toThrow("Confirmez l’identité");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(socialProfile({ followStatus, verificationStatus: "verified", version: 1 }));
    await recordSocialFollow({ ...recordInput, followStatus });
    expect(request).toHaveBeenCalledWith("/api/marketing/social-follow", expect.objectContaining({ body: { action: "record", ...recordInput, followStatus }, timeoutMs: 50_000 }));
  });

  it("adds a canonical candidate with the chosen restaurant, optional evidence and note", async () => {
    request.mockResolvedValue({ profile: socialProfile(), duplicate: false });
    await addSocialFollowProfile({ restaurantId: SOCIAL_RESTAURANT_ID, profileUrl: "https://instagram.com/Restaurant_Du_Lac/?utm_source=site", sourceUrl: null, note: "Vu sur la carte du restaurant" });
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/marketing/social-follow", expect.objectContaining({ body: {
      action: "add", restaurantId: SOCIAL_RESTAURANT_ID, profileUrl: "https://www.instagram.com/restaurant_du_lac/", sourceUrl: null, note: "Vu sur la carte du restaurant",
    } }));
  });

  it("validates every external destination and resets tracking for another TOK account", () => {
    expect(socialProfileHref("javascript:alert(1)", "instagram")).toBeNull();
    expect(socialProfileHref("https://www.instagram.com/p/123/", "instagram")).toBeNull();
    expect(socialProfileHref("https://instagram.com/restaurant_du_lac/", "facebook")).toBeNull();
    expect(socialProfileHref("https://instagram.com/restaurant_du_lac/", "instagram")).toBe("https://www.instagram.com/restaurant_du_lac/");
    expect(socialSourceHref("https://user:password@example.com/")).toBeNull();
    expect(socialSourceHref("data:text/html,hello")).toBeNull();
    expect(socialSourceHref("http://restaurant.example/contact")).toBe("http://restaurant.example/contact");
    const account = socialList().sourceAccounts[0];
    expect(socialFollowStatusForAccount(socialProfile({ followStatus: "followed" }), account)).toBe("followed");
    expect(socialFollowStatusForAccount(socialProfile({ followStatus: "followed" }), { ...account, id: "17841400000000002" })).toBe("unknown");
    expect(socialFollowStatusForAccount(socialProfile({ followStatus: "followed" }), { ...account, configured: false })).toBe("unknown");
  });
});
