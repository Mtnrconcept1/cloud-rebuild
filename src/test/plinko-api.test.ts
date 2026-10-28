import { afterEach, describe, expect, it, vi } from "vitest";
import { claimPlinko, getPlinkoStatus, isPlinkoSurface, parsePlinkoState, PlinkoSessionExpiredError, playPlinko, startPlinkoSession } from "@/lib/plinko";

const empty = { ok: true, enabled: true, available: true, play: null, reward: null };
const won = { ...empty, available: false, play: { id: "play-1", outcome: "half_price", createdAt: "2026-10-28T12:00:00Z" }, reward: { id: "reward-1", outcome: "half_price", label: "−50 % sur un repas", status: "pending_email" } };

afterEach(() => vi.unstubAllGlobals());

describe("Plinko public transport", () => {
  it("starts without account credentials and keeps the bearer out of URLs", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ...empty, token: "opaque-token" })));
    vi.stubGlobal("fetch", fetcher);
    expect((await startPlinkoSession()).token).toBe("opaque-token");
    await getPlinkoStatus("opaque-token");
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe("https://placeholder.supabase.co/functions/v1/plinko-play");
    expect(url).not.toContain("opaque-token");
    expect(JSON.parse(init.body)).toEqual({ action: "status", token: "opaque-token" });
    expect(init.credentials).toBe("omit");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("sends the retry identity and never a client-selected outcome", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(won)));
    vi.stubGlobal("fetch", fetcher);
    await playPlinko("opaque-token", "request-1");
    const [, init] = fetcher.mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("request-1");
    expect(JSON.parse(init.body)).toEqual({ action: "play", token: "opaque-token" });
  });

  it("claims with explicit optional consent without changing an address silently", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(won)));
    vi.stubGlobal("fetch", fetcher);
    await claimPlinko("opaque-token", "claim-1", " Client@exemple.ch ", false);
    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ action: "claim", token: "opaque-token", email: "Client@exemple.ch", marketingConsent: false });
  });

  it("distinguishes an expired session from an ordinary transport error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(getPlinkoStatus("expired")).rejects.toBeInstanceOf(PlinkoSessionExpiredError);
  });

  it("does not reflect server error details or email addresses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "private@exemple.ch SQL internal" }), { status: 500 })));
    await expect(startPlinkoSession()).rejects.toThrow("Impossible de joindre le chef");
  });
});

describe("Plinko response integrity", () => {
  it.each([
    null,
    {},
    { ...empty, play: undefined },
    { ...empty, reward: undefined },
    { ...won, reward: null },
    { ...won, play: { ...won.play, outcome: "unknown" } },
    { ...won, reward: { ...won.reward, outcome: "free_meal" } },
    { ...won, play: { ...won.play, outcome: "lost" } },
    { ...won, reward: { ...won.reward, status: "invented" } },
  ])("rejects incomplete or inconsistent prize state %#", (value) => {
    expect(() => parsePlinkoState(value)).toThrow("Réponse du jeu invalide");
  });

  it.each(["pending_email", "pending_fulfillment", "fulfilled", "cancelled"])("recovers the %s reward lifecycle", (status) => {
    expect(parsePlinkoState({ ...won, reward: { ...won.reward, status } }).reward?.status).toBe(status);
  });
});

describe("Plinko eligible public pages", () => {
  it.each(["/", "/recherche", "/restaurant/un-resto", "/restaurants/geneve", "/tok-one"])("allows discovery on %s", (path) => expect(isPlinkoSurface(path)).toBe(true));
  it.each(["/auth", "/panier", "/commande/123", "/dashboard", "/admin", "/courier", "/contact", "/coming-soon"])("keeps %s free of the promotional prompt", (path) => expect(isPlinkoSurface(path)).toBe(false));
});
