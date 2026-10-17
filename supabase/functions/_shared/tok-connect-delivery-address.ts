import { TokCustomerCommerceError } from "./tok-connect-customer-commerce.ts";

/** Server-side counterpart of TOK's Photon address selection. Never accept GPS from ChatGPT.
 * Photon API: https://github.com/komoot/photon/blob/master/docs/api-v1.md
 * The public provider is already used by AddressAutocomplete /api/photon.
 */
export type TokVerifiedDeliveryAddress = {
  latitude: number;
  longitude: number;
  city: string;
  postcode: string;
  formatted_address: string;
  country_code: "CH";
  provider: "photon";
  checked_at: string;
};
export class TokDeliveryAddressError extends TokCustomerCommerceError {}
type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_LIMIT = 250;
const MAX_BYTES = 64 * 1024;
const cache = new Map<string, { expires: number; value: TokVerifiedDeliveryAddress }>();
function normalized(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function addressKey(value: string) {
  return normalized(value).replace(/\s+(suisse|switzerland|schweiz|svizzera|ch)$/, "");
}
async function readLimitedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) throw new TokDeliveryAddressError(503, "tok_cart_geocoder_response_invalid");
  if (!response.body) throw new TokDeliveryAddressError(503, "tok_cart_geocoder_response_invalid");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new TokDeliveryAddressError(503, "tok_cart_geocoder_response_invalid"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw new TokDeliveryAddressError(503, "tok_cart_geocoder_response_invalid"); }
}
function parseExactAddress(feature: unknown, requestedKey: string, now: Date): TokVerifiedDeliveryAddress | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) return null;
  const properties = feature.properties, geometry = feature.geometry;
  if (String(properties.countrycode || "").toUpperCase() !== "CH" || geometry.type !== "Point") return null;
  const point = geometry.coordinates;
  if (!Array.isArray(point) || point.length !== 2 || point.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  const [longitude, latitude] = point as number[];
  // Secondary sanity bounds only; the authoritative country comes from the provider.
  if (latitude < 45.7 || latitude > 47.9 || longitude < 5.9 || longitude > 10.7) return null;
  const street = typeof properties.street === "string" ? properties.street.trim() : "";
  const number = typeof properties.housenumber === "string" ? properties.housenumber.trim() : "";
  const postcode = typeof properties.postcode === "string" ? properties.postcode.trim() : "";
  const city = String(properties.city || properties.town || properties.village || "").trim();
  if (!street || !number || !/^[1-9]\d{3}$/.test(postcode) || !city) return null;
  const formatted = `${street} ${number}, ${postcode} ${city}`;
  if (![formatted, `${number} ${street}, ${postcode} ${city}`].some((label) => addressKey(label) === requestedKey)) return null;
  return { latitude, longitude, city, postcode, formatted_address: formatted, country_code: "CH", provider: "photon", checked_at: now.toISOString() };
}
export async function resolveTokDeliveryAddress(address: string, options: {
  fetchImpl?: typeof fetch;
  beforeFetch?: () => Promise<void>;
  now?: Date;
  useCache?: boolean;
} = {}): Promise<TokVerifiedDeliveryAddress> {
  const now = options.now || new Date(), key = addressKey(address);
  const previous = options.useCache === false ? undefined : cache.get(key);
  if (previous && previous.expires > now.getTime()) return { ...previous.value };
  await options.beforeFetch?.();
  const url = new URL("https://photon.komoot.io/api");
  url.search = new URLSearchParams({ q: address, countrycode: "CH", layer: "house", limit: "5", lang: "fr" }).toString();
  try {
    const response = await (options.fetchImpl || fetch)(url.toString(), {
      headers: { accept: "application/json", "user-agent": "TOK-Connect/1.0 (+https://www.thetok.ch)" },
      redirect: "error", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new TokDeliveryAddressError(503, "tok_cart_geocoder_unavailable");
    const document = await readLimitedJson(response);
    if (!isRecord(document) || !Array.isArray(document.features)) throw new TokDeliveryAddressError(503, "tok_cart_geocoder_response_invalid");
    const candidates = document.features.slice(0, 5).map((feature) => parseExactAddress(feature, key, now)).filter((value): value is TokVerifiedDeliveryAddress => value !== null);
    if (!candidates.length) throw new TokDeliveryAddressError(422, "tok_cart_delivery_address_not_precisely_resolved");
    const selected = candidates[0];
    if (candidates.some((value) => Math.abs(value.latitude - selected.latitude) > 0.0003 || Math.abs(value.longitude - selected.longitude) > 0.0003)) throw new TokDeliveryAddressError(422, "tok_cart_delivery_address_ambiguous");
    if (options.useCache !== false) {
      for (const [cachedKey, value] of cache) if (value.expires <= now.getTime()) cache.delete(cachedKey);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: now.getTime() + CACHE_TTL, value: selected });
    }
    return { ...selected };
  } catch (error) {
    if (error instanceof TokDeliveryAddressError) throw error;
    throw new TokDeliveryAddressError(503, "tok_cart_geocoder_unavailable");
  }
}
