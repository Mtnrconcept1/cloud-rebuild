/** Persisted generation contract: never infer a physical format from an image ratio. */
export type GeneratedOutputFormat = {
  destination: "digital" | "print";
  providerProductId?: string;
  widthMm?: number;
  heightMm?: number;
  bleedMm?: number;
};

export function readGeneratedOutputFormat(value: unknown): GeneratedOutputFormat | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.destination === "digital") return { destination: "digital" };
  if (row.destination !== "print" || typeof row.providerProductId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.providerProductId)
    || typeof row.widthMm !== "number" || !Number.isFinite(row.widthMm) || row.widthMm <= 0
    || typeof row.heightMm !== "number" || !Number.isFinite(row.heightMm) || row.heightMm <= 0
    || typeof row.bleedMm !== "number" || !Number.isFinite(row.bleedMm) || row.bleedMm < 0) return null;
  return { destination: "print", providerProductId: row.providerProductId,
    widthMm: row.widthMm, heightMm: row.heightMm, bleedMm: row.bleedMm };
}

export function matchesGeneratedPrintFormat(value: unknown, variant: {
  providerProductId: string; widthMm: number; heightMm: number; bleedMm: number;
}): boolean {
  const format = readGeneratedOutputFormat(value);
  return format?.destination === "print"
    && format.providerProductId === variant.providerProductId
    && format.widthMm === variant.widthMm && format.heightMm === variant.heightMm
    && format.bleedMm === variant.bleedMm;
}

/** Use the verified physical geometry, never a separate client orientation. */
export function generatedPrintOrientation(format: GeneratedOutputFormat): "square" | "portrait" | "landscape" {
  const width = Number(format.widthMm) + 2 * Number(format.bleedMm);
  const height = Number(format.heightMm) + 2 * Number(format.bleedMm);
  if (Math.abs(width / height - 1) <= 0.02) return "square";
  return width > height ? "landscape" : "portrait";
}
