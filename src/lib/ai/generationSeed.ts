const MAX_TOK_GENERATION_SEED_LENGTH = 64;

export function sanitizeTokGenerationSeed(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TOK_GENERATION_SEED_LENGTH);
}

export function createTokGenerationSeed(prefix = "tok") {
  const safePrefix = sanitizeTokGenerationSeed(prefix) || "tok";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);

  return sanitizeTokGenerationSeed(`${safePrefix}-${date}-${randomPart}`);
}
