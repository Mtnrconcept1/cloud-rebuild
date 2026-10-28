import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWorldArt, reverseWorldCoordinates } from "@/lib/homeWorldHero";

describe("TOK worldwide home illustrations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses native Lisbon mobile and desktop files", () => {
    const art = resolveWorldArt("Lisboa, Portugal");
    expect(art?.desktop).toMatch(/lisbonne.*desktop.*webp/);
    expect(art?.mobile).toMatch(/lisbonne.*mobile.*webp/);
  });
  it("finds French and accented city names and country fallbacks", () => {
    expect(resolveWorldArt("Montréal")?.desktop).toMatch(/montreal.*webp/);
    expect(resolveWorldArt("Unknown Village, France")?.desktop).toMatch(/paris.*webp/);
    expect(resolveWorldArt(null, "JP")?.desktop).toMatch(/tokyo.*webp/);
    expect(resolveWorldArt(null, "ZZ")).toBeNull();
  });
  it("safely rejects invalid GPS coordinates without contacting providers", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    await expect(reverseWorldCoordinates({ latitude: 1000, longitude: 10 })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves the location returned by the reverse-geocoding provider", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      city: "Geneva",
      countryCode: "CH",
    })));

    await expect(reverseWorldCoordinates({ latitude: 46.21, longitude: 6.23 })).resolves.toEqual({
      city: "Geneva",
      country: "CH",
    });
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin).toBe("https://api.bigdatacloud.net");
    expect(url.pathname).toBe("/data/reverse-geocode-client");
    expect(url.searchParams.get("latitude")).toBe("46.21");
    expect(url.searchParams.get("longitude")).toBe("6.23");
  });

  it("keeps failed network or CSP requests nonfatal for the homepage", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(reverseWorldCoordinates({ latitude: 46.21, longitude: 6.23 })).resolves.toBeNull();
  });

  it.each([
    ["HTTP error", () => new Response(null, { status: 503 })],
    ["invalid JSON", () => new Response("not-json")],
  ])("keeps a provider %s nonfatal for the homepage", async (_label, response) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response());

    await expect(reverseWorldCoordinates({ latitude: 46.21, longitude: 6.23 })).resolves.toBeNull();
  });
});
