type RestaurantIdentity = {
  name: string;
  address: string | null;
  city: string | null;
};

export type CoverMetadataReview = {
  decision: "rejected" | "manual_review";
  reason: string;
};

export function canonicalEvidenceUrl(value: unknown, baseUrl?: string): string | null {
  if (typeof value !== "string" || !value.trim() || value.trim().startsWith("#")) return null;
  try {
    const url = new URL(value.trim().replace(/&amp;/gi, "&"), baseUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function coverImageFilename(value: string): string {
  try {
    const filename = new URL(value).pathname.split("/").at(-1) || "";
    return decodeURIComponent(filename).toLowerCase();
  } catch {
    return "";
  }
}

export function reviewCoverMetadata(value: string): CoverMetadataReview | null {
  const filename = coverImageFilename(value).replace(/[-_\s]+/g, " ");
  if (/logo|favicon|icon|avatar|sprite|pixel|tracking|emoji|badge|placeholder|spinner|loader|dummy/.test(filename)
    || /cartes? de visite|business cards?/.test(filename)
    || /(?:^|[ .])(?:default image|map marker)(?:[ .\d]|$)/.test(filename)) {
    return { decision: "rejected", reason: "non_photographic_cover_metadata" };
  }
  if (/partenaire|partner|menu|carte|banner|banniere|flyer|payment|social/.test(filename)) {
    return { decision: "manual_review", reason: "ambiguous_cover_metadata" };
  }
  return null;
}

export function isOwnedRestaurantImageUrl(value: string, supabaseUrl: string): boolean {
  const candidate = canonicalEvidenceUrl(value);
  const configured = canonicalEvidenceUrl(supabaseUrl);
  if (!candidate || !configured) return false;
  const url = new URL(candidate);
  return url.origin === new URL(configured).origin
    && url.pathname.startsWith("/storage/v1/object/public/restaurant-images/");
}

function normalizedText(value: unknown): string {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizedStreet(value: unknown): string {
  return normalizedText(String(value || "").split(",")[0]);
}

function matchesAddress(value: unknown, expected: RestaurantIdentity): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const address = value as Record<string, unknown>;
  const street = normalizedStreet(expected.address);
  const city = normalizedText(expected.city);
  return Boolean(street && /\b\d{1,5}[a-z]?\b/.test(street) && city
    && normalizedStreet(address.streetAddress) === street
    && normalizedText(address.addressLocality) === city);
}

function imageValues(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.slice(0, 20).flatMap((item) => imageValues(item, depth + 1)).slice(0, 20);
  if (!value || typeof value !== "object") return [];
  const image = value as Record<string, unknown>;
  // An unresolved @id identifies a node, not an image file.
  return [image.url, image.contentUrl].flatMap((item) => imageValues(item, depth + 1)).slice(0, 20);
}

/** Only the same structured restaurant entity may associate a photo with an address. */
export function restaurantEntityImages(
  html: string,
  sourceUrl: string,
  expected: RestaurantIdentity,
): string[] {
  const found = new Set<string>();
  const expectedName = normalizedText(expected.name);
  if (!expectedName) return [];
  let visited = 0;
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || ++visited > 2_000 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 50)) visit(item, depth + 1);
      return;
    }
    const node = value as Record<string, unknown>;
    const types = (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]])
      .map((type) => String(type || "").split(/[/#]/).at(-1)?.toLowerCase());
    if (types.some((type) => ["restaurant", "cafeorcoffeeshop", "barorpub", "foodestablishment"].includes(type || ""))
      && normalizedText(node.name) === expectedName
      && matchesAddress(node.address, expected)) {
      for (const value of imageValues(node.image)) {
        const url = canonicalEvidenceUrl(value, sourceUrl);
        if (url) found.add(url);
      }
    }
    for (const value of Object.values(node).slice(0, 50)) visit(value, depth + 1);
  };

  const scripts = html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi);
  let scriptCount = 0;
  for (const match of scripts) {
    if (++scriptCount > 20) break;
    try {
      visit(JSON.parse(match[1]));
    } catch {
      // Invalid structured data provides no evidence.
    }
  }
  return [...found];
}
