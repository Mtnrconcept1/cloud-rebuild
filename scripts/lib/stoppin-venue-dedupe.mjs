// Pure helpers: importing this module never queries Supabase or starts a build.
export function coordinate(value, min, max) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isVenueSlug(value) {
  return typeof value === "string" && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function normalizedVenueName(venue) {
  // Strip only trailing geographic noise, never a word inside a venue name.
  return slugify(venue?.name).replace(/(?:-(?:geneva|geneve|ch|fr))+$/, "");
}

function distanceMetres(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLng = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function dedupeVenuesByPlace(venues) {
  const groups = new Map();
  const kept = [];
  const aliasToCanonical = new Map();
  // Sorting first makes the shortest slug the stable representative. No mutation
  // of the caller's array and no transitive merging outside that representative's radius.
  const ordered = [...venues].sort((a, b) => {
    const left = String(a?.tok_slug || "");
    const right = String(b?.tok_slug || "");
    return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
  });
  for (const venue of ordered) {
    const latitude = coordinate(venue?.latitude, -90, 90);
    const longitude = coordinate(venue?.longitude, -180, 180);
    const name = normalizedVenueName(venue);
    // Match the renderer's required identity fields. An incomplete short record
    // must not erase a complete, renderable record of the same place.
    if (!venue?.id || !isVenueSlug(venue?.tok_slug) || !name
      || typeof venue?.name !== "string" || !venue.name.trim()
      || typeof venue?.city_name !== "string" || !venue.city_name.trim()
      || latitude === null || longitude === null) {
      kept.push(venue);
      continue;
    }
    const representatives = groups.get(name) || [];
    const point = { latitude, longitude };
    const canonical = representatives.find((entry) => distanceMetres(entry, point) <= 55);
    if (canonical) {
      if (canonical.tok_slug !== venue.tok_slug) aliasToCanonical.set(venue.tok_slug, canonical.tok_slug);
    } else {
      representatives.push({ ...point, tok_slug: venue.tok_slug });
      groups.set(name, representatives);
      kept.push(venue);
    }
  }
  return { venues: kept, aliasToCanonical };
}
