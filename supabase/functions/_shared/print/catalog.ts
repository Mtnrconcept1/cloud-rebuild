type PrintVariant = { printable_sides?: unknown; specifications?: unknown };
type LogicalProduct = { category?: unknown; slug?: unknown; default_width_mm?: unknown; default_height_mm?: unknown };

/** The exporter currently produces one page, never a back, booklet or calendar. */
export function isSinglePagePrintProduct(variant: PrintVariant, logicalProduct?: LogicalProduct | null): boolean {
  if (Number(variant.printable_sides) !== 1) return false;
  const category = `${logicalProduct?.category || ""} ${logicalProduct?.slug || ""}`.toLowerCase();
  if (/(calendar|book|folded|brochure|livret|calendrier)/.test(category)) return false;
  const specs = variant.specifications && typeof variant.specifications === "object"
    ? variant.specifications as Record<string, unknown> : {};
  const pages = specs["number of printable pages"];
  if (pages === undefined || pages === null || pages === "") return true;
  const count = Number(pages);
  return Number.isInteger(count) && count === 1;
}

/** A portrait mapping must not silently become a landscape product. */
export function geometryMatchesLogicalProduct(product: LogicalProduct, variant: { width_mm?: unknown; height_mm?: unknown }): boolean {
  const values = [variant.width_mm, variant.height_mm, product.default_width_mm, product.default_height_mm].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return false;
  const [width, height, expectedWidth, expectedHeight] = values;
  return Math.abs(width - expectedWidth) <= 1.5 && Math.abs(height - expectedHeight) <= 1.5;
}
