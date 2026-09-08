import type { PrintProviderOption } from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isDefaultOption(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function optionReference(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(normalized) ? normalized : "";
}

function optionCount(option: Record<string, unknown>) {
  const raw = option.count ?? option.default_count ?? 1;
  const numeric = Math.round(Number(raw));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

/**
 * Converts the immutable Cloudprinter product snapshot captured with the BAT
 * into the exact option list expected by CloudCore quote/order requests.
 *
 * Cloudprinter exposes the option API reference in `reference` while the
 * request payload calls that field `type`. Only one option from a provider
 * option category may be sent, so duplicate defaults from stale provider data
 * are ignored after the first valid choice.
 */
export function getCloudprinterDefaultOptions(productSpecSnapshot: unknown): PrintProviderOption[] {
  const snapshot = asRecord(productSpecSnapshot);
  const options = Array.isArray(snapshot.options) ? snapshot.options : [];
  const selected: PrintProviderOption[] = [];
  const selectedCategories = new Set<string>();
  const selectedReferences = new Set<string>();

  for (const value of options) {
    const option = asRecord(value);
    if (!isDefaultOption(option.default)) continue;

    const reference = optionReference(option.reference);
    if (!reference || selectedReferences.has(reference)) continue;

    const category = typeof option.type === "string" ? option.type.trim() : "";
    if (category && selectedCategories.has(category)) continue;

    selected.push({ type: reference, count: optionCount(option) });
    selectedReferences.add(reference);
    if (category) selectedCategories.add(category);
  }

  return selected;
}
