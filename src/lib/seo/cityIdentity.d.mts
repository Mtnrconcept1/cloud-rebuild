export declare function cityLabel(value: unknown): string;
export declare function citySlug(value: unknown): string;
export declare function isCanonicalCitySpelling(value: unknown): boolean;

export type CityPathCandidate = { city?: string | null; id?: string | null };

export declare function winsCityPathConflict(
  candidate: CityPathCandidate,
  rival: CityPathCandidate,
): boolean;

export declare function pickOneRestaurantPerPath<T>(
  entries: readonly T[],
  pathOf: (entry: T) => string,
): Map<string, T>;
