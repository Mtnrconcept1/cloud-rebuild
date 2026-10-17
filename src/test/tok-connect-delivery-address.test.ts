import { describe, expect, it, vi } from "vitest";
import { resolveTokDeliveryAddress } from "../../supabase/functions/_shared/tok-connect-delivery-address";
const address = "Rue de Lyon 55, 1203 Genève";
function feature(patch: Record<string, unknown> = {}, coordinates: unknown = [6.1324, 46.2097]) {
  return { type: "Feature", properties: { countrycode: "CH", street: "Rue de Lyon", housenumber: "55", postcode: "1203", city: "Genève", ...patch }, geometry: { type: "Point", coordinates } };
}
describe("TOK server-verified delivery coordinates", () => {
  it("uses only the existing fixed Photon provider and matches exact Swiss address fields", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => Response.json({ features: [feature()] }));
    const value = await resolveTokDeliveryAddress("55 rue de Lyon, 1203 Geneve, Suisse", { fetchImpl, useCache: false });
    expect(value).toMatchObject({ latitude: 46.2097, longitude: 6.1324, formatted_address: address, country_code: "CH", provider: "photon" });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin).toBe("https://photon.komoot.io");
    expect(url.pathname).toBe("/api");
    expect(url.searchParams.get("countrycode")).toBe("CH");
    expect(url.searchParams.get("layer")).toBe("house");
  });
  it.each([feature({}, null), feature({}, [0, 0]), feature({}, [null, 46.2]), feature({ housenumber: "57" }), feature({ countrycode: "FR" }), feature({ street: "Rue de Lausanne" }), feature({ postcode: "1201" })])("does not invent coordinates or choose an approximate address", async (candidate) => {
    await expect(resolveTokDeliveryAddress(address, { fetchImpl: async () => Response.json({ features: [candidate] }), useCache: false })).rejects.toMatchObject({ status: 422, message: "tok_cart_delivery_address_not_precisely_resolved" });
  });
  it("refuses ambiguous destinations rather than choosing a different building", async () => {
    await expect(resolveTokDeliveryAddress(address, { fetchImpl: async () => Response.json({ features: [feature(), feature({}, [6.14, 46.22])] }), useCache: false })).rejects.toMatchObject({ status: 422, message: "tok_cart_delivery_address_ambiguous" });
  });
  it("fails closed on provider failures, malformed or oversized responses", async () => {
    for (const fetchImpl of [async () => Response.json({}, { status: 503 }), async () => new Response("not json"), async () => new Response("{}", { headers: { "content-length": "100000" } }), async () => { throw new Error("network_failed"); }]) {
      await expect(resolveTokDeliveryAddress(address, { fetchImpl, useCache: false })).rejects.toMatchObject({ status: 503 });
    }
  });
  it("caches verified results for a bounded time and does not expose mutable shared state", async () => {
    const beforeFetch = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => Response.json({ features: [feature({ street: "Rue du Test", housenumber: "11" })] }));
    const options = { fetchImpl, beforeFetch, now: new Date("2026-11-01T12:00:00Z") };
    const first = await resolveTokDeliveryAddress("Rue du Test 11, 1203 Genève", options);
    first.latitude = 0;
    expect((await resolveTokDeliveryAddress("Rue du Test 11, 1203 Genève", options)).latitude).toBe(46.2097);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(beforeFetch).toHaveBeenCalledOnce();
    await resolveTokDeliveryAddress("Rue du Test 11, 1203 Genève", { ...options, now: new Date("2026-11-01T13:00:00Z") });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
