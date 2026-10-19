export type LocalPageType = "city" | "cuisine" | "district" | "intent";

export interface LocalInventoryPolicy {
  minCityRestaurants: number;
  minSpecializedRestaurants: number;
  maxParentCoverage: number;
}

export interface LocalInventorySnapshot {
  version: 1;
  path: string;
  pageType: LocalPageType;
  inventoryCount: number;
  parentInventoryCount: number | null;
  itemListComplete: true;
  policy: LocalInventoryPolicy;
  indexable: boolean;
}

export function resolveLocalInventoryPolicy(options?: Partial<LocalInventoryPolicy>): LocalInventoryPolicy;

export function getLocalInventoryDecision(options?: {
  pageType?: LocalPageType;
  inventoryCount?: number;
  parentInventoryCount?: number | null;
  policy?: Partial<LocalInventoryPolicy>;
}): {
  indexable: boolean;
  reason: "thin" | "parent-duplicate" | null;
  minimum: number;
};

export function parseLocalInventorySnapshot(serialized: string | null | undefined, pathname: string): LocalInventorySnapshot | null;
