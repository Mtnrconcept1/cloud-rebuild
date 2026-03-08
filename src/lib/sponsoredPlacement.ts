interface CardWithId {
  id?: string | number | null;
}

interface SponsoredPlacementOptions {
  topSlots?: number;
  maxItems?: number;
}

export function prioritizeSponsoredCards<T extends CardWithId>(
  organicCards: T[],
  sponsoredCards: T[],
  options: SponsoredPlacementOptions = {},
): T[] {
  const topSlots = Math.max(0, options.topSlots ?? 3);
  const maxItems = typeof options.maxItems === "number" ? Math.max(0, options.maxItems) : undefined;

  const organic = (organicCards || []) as T[];
  const sponsored = (sponsoredCards || []) as T[];

  if (!sponsored.length) {
    return typeof maxItems === "number" ? organic.slice(0, maxItems) : organic;
  }

  const seenSponsoredIds = new Set<string | number>();
  const uniqueSponsored = sponsored.filter((card) => {
    if (card == null) return false;
    const { id } = card;
    if (id === undefined || id === null) return true;
    if (seenSponsoredIds.has(id)) return false;
    seenSponsoredIds.add(id);
    return true;
  });

  const sponsoredIds = new Set(
    uniqueSponsored
      .map((card) => card.id)
      .filter((id): id is string | number => id !== undefined && id !== null),
  );

  const organicWithoutSponsored = organic.filter((card) => {
    if (card == null) return false;
    const { id } = card;
    if (id === undefined || id === null) return true;
    return !sponsoredIds.has(id);
  });

  const prioritizedSponsored = uniqueSponsored.slice(0, topSlots);
  const overflowSponsored = uniqueSponsored.slice(topSlots);
  const merged = [...prioritizedSponsored, ...organicWithoutSponsored, ...overflowSponsored];

  return typeof maxItems === "number" ? merged.slice(0, maxItems) : merged;
}