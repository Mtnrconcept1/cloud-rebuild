function finitePositive(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNonNegative(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeSpecifications(specifications: Record<string, string>) {
  return new Map(
    Object.entries(specifications).map(([key, value]) => [key.trim().toLowerCase(), String(value).trim()]),
  );
}

function firstValue(
  specs: Map<string, string>,
  aliases: string[],
  pattern?: RegExp,
) {
  for (const alias of aliases) {
    const value = specs.get(alias.toLowerCase());
    if (value !== undefined) return value;
  }
  if (pattern) {
    for (const [key, value] of specs.entries()) {
      if (pattern.test(key)) return value;
    }
  }
  return undefined;
}

export type CloudprinterProductGeometry = {
  widthMm: number | null;
  heightMm: number | null;
  foldedWidthMm: number | null;
  foldedHeightMm: number | null;
  bleedMm: number | null;
  safeMarginMm: number | null;
};

export function parseCloudprinterProductGeometry(
  specifications: Record<string, string>,
): CloudprinterProductGeometry {
  const specs = normalizeSpecifications(specifications);

  const trimmedWidth = firstValue(
    specs,
    [
      "the exact width of the card in mm. after trimming",
      "the exact width of the item in mm. after trimming",
      "the exact width of the product in mm. after trimming",
    ],
    /^the exact width of the .+ in mm\.? after trimming$/i,
  );
  const trimmedHeight = firstValue(
    specs,
    [
      "the exact height of the card in mm. after trimming",
      "the exact height of the item in mm. after trimming",
      "the exact height of the product in mm. after trimming",
    ],
    /^the exact height of the .+ in mm\.? after trimming$/i,
  );

  const directWidth = firstValue(
    specs,
    [
      "the exact width of the item in mm.",
      "the exact width of the item in mm",
      "the exact width of the product in mm.",
      "the exact width of the product in mm",
      "the exact width of the card in mm.",
      "the exact width of the card in mm",
    ],
    /^the exact width of the .+ in mm\.?$/i,
  );
  const directHeight = firstValue(
    specs,
    [
      "the exact height of the item in mm.",
      "the exact height of the item in mm",
      "the exact height of the product in mm.",
      "the exact height of the product in mm",
      "the exact height of the card in mm.",
      "the exact height of the card in mm",
    ],
    /^the exact height of the .+ in mm\.?$/i,
  );

  const foldedWidth = firstValue(
    specs,
    [
      "the exact width of the card in mm. after folding",
      "the exact width of the item in mm. after folding",
      "the exact width of the product in mm. after folding",
    ],
    /^the exact width of the .+ in mm\.? after folding$/i,
  );
  const foldedHeight = firstValue(
    specs,
    [
      "the exact height of the card in mm. after folding",
      "the exact height of the item in mm. after folding",
      "the exact height of the product in mm. after folding",
    ],
    /^the exact height of the .+ in mm\.? after folding$/i,
  );

  return {
    widthMm: finitePositive(trimmedWidth ?? directWidth),
    heightMm: finitePositive(trimmedHeight ?? directHeight),
    foldedWidthMm: finitePositive(foldedWidth),
    foldedHeightMm: finitePositive(foldedHeight),
    bleedMm: finiteNonNegative(firstValue(specs, ["bleed in mm"])),
    safeMarginMm: finiteNonNegative(firstValue(specs, ["the page safety margin in mm", "page safety margin in mm"])),
  };
}
