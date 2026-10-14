import { describe, expect, it, vi } from "vitest";
import { resolveWorldArt, reverseWorldCoordinates } from "@/lib/homeWorldHero";

describe("TOK worldwide home illustrations", () => {
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
    fetcher.mockRestore();
  });
});
