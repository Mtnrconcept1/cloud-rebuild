export const REQUIRED_SUPABASE_PUBLIC_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

export type RequiredSupabasePublicEnvKey = (typeof REQUIRED_SUPABASE_PUBLIC_ENV_KEYS)[number];

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function sanitizeEnvValue(value: unknown) {
  if (typeof value !== "string") return "";
  return stripWrappingQuotes(value.trim()).replace(/[\r\n]+/g, "").trim();
}

export function getMissingSupabasePublicEnvKeys(
  env: Partial<Record<RequiredSupabasePublicEnvKey, unknown>>,
) {
  return REQUIRED_SUPABASE_PUBLIC_ENV_KEYS.filter((key) => !sanitizeEnvValue(env[key]));
}

export function readSupabasePublicEnv(
  env: Partial<Record<RequiredSupabasePublicEnvKey, unknown>>,
  context: string,
) {
  const url = sanitizeEnvValue(env.VITE_SUPABASE_URL);
  const publishableKey = sanitizeEnvValue(env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const missing = getMissingSupabasePublicEnvKeys(env);

  if (missing.length) {
    throw new Error(
      `Missing required Supabase public environment variables for ${context}: ${missing.join(", ")}.`,
    );
  }

  return {
    url,
    publishableKey,
  };
}
