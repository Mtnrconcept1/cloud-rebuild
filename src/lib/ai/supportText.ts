export const DEVANAGARI_SCRIPT_PATTERN = /[\u0900-\u097F]+/g;

export function normalizeVisibleAiSupportText(value: string) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "";

  const normalized = trimmed
    .replace(/prochain\s+[\u0900-\u097F]+(?=\s*:)/gi, "prochain message")
    .replace(DEVANAGARI_SCRIPT_PATTERN, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s+:/g, " :")
    .trim();

  return normalized || trimmed;
}
