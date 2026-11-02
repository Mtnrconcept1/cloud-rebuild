export const LOCAL_CUISINE_ALIASES: Readonly<Record<string, string>>;

export function normalizeLocalCuisineSlug(value: unknown): string;

export function extractLocalCuisineSlugs(value: unknown, extraSlugs?: unknown): string[];

export function getLocalCuisineCatalogPrefix(value: unknown): string | null;
