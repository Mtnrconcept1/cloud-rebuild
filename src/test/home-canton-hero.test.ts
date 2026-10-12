import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SWISS_CANTON_CODES,
  cantonAtCoordinates,
  cantonFromPlaceName,
  cantonHeroSrc,
} from "@/lib/homeCantonHero";

describe("canton-specific TOK homepage imagery", () => {
  it("covers all 26 cantons with valid, independent, lightweight WebP files", () => {
    expect(new Set(SWISS_CANTON_CODES).size).toBe(26);
    for (const canton of SWISS_CANTON_CODES) {
      const src = cantonHeroSrc(canton);
      expect(src).toBe("/desig%20app/tok-ch-" + canton.toLowerCase() + ".webp");
      const file = resolve(process.cwd(), "public", decodeURIComponent(src.slice(1)));
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThan(250_000);
      const header = readFileSync(file).subarray(0, 12);
      expect(header.toString("ascii", 0, 4)).toBe("RIFF");
      expect(header.toString("ascii", 8, 12)).toBe("WEBP");
    }
  });

  it.each([
    ["Genève", "GE"], ["Puplinge", "GE"], ["Carouge GE", "GE"],
    ["Lausanne", "VD"], ["Yverdon-les-Bains", "VD"], ["Berne", "BE"],
    ["Zurich", "ZH"], ["Lugano", "TI"], ["Sion", "VS"],
    ["Bâle", "BS"], ["Bâle-Campagne", "BL"], ["Herisau", "AR"],
    ["Appenzell", "AI"], ["Fribourg", "FR"], ["Neuchâtel", "NE"],
    ["Saint-Gall", "SG"], ["Grisons", "GR"], ["Genève, Suisse", "GE"],
  ] as const)("resolves %s to %s", (city, expected) => {
    expect(cantonFromPlaceName(city)).toBe(expected);
  });

  it("does not guess a canton for unknown or foreign cities", () => {
    expect(cantonFromPlaceName("")).toBeNull();
    expect(cantonFromPlaceName("Paris")).toBeNull();
    expect(cantonFromPlaceName("Suisse")).toBeNull();
  });

  it("uses the official Swiss municipal boundary lookup with WGS84 longitude first", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{
          layerBodId: "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill",
          attributes: { kanton: "VD" },
        }],
      }),
    })) as unknown as typeof fetch;
    await expect(cantonAtCoordinates({ latitude: 46.5197, longitude: 6.6323 }, fetcher)).resolves.toBe("VD");
    const url = new URL(String(vi.mocked(fetcher).mock.calls[0][0]));
    expect(url.searchParams.get("geometry")).toBe("6.6323,46.5197");
    expect(url.searchParams.get("sr")).toBe("4326");
    expect(url.searchParams.get("tolerance")).toBe("0");
    expect(url.searchParams.get("layers")).toBe("all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill");
  });

  it("fails safely for foreign coordinates, errors and invalid API results", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("unavailable");
    }) as unknown as typeof fetch;
    await expect(cantonAtCoordinates({ latitude: 48.8566, longitude: 2.3522 }, fetcher)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(cantonAtCoordinates({ latitude: 46.2044, longitude: 6.1432 }, fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();

    const empty = (async () => ({
      ok: true,
      json: async () => ({ results: [{ attributes: { kanton: "XX" } }] }),
    })) as unknown as typeof fetch;
    await expect(cantonAtCoordinates({ latitude: 46.2044, longitude: 6.1432 }, empty)).resolves.toBeNull();
  });
});
