export const REQUIRED_SUPABASE_PUBLIC_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

export type RequiredSupabasePublicEnvKey = (typeof REQUIRED_SUPABASE_PUBLIC_ENV_KEYS)[number];

type SupabasePublicEnv = Partial<Record<RequiredSupabasePublicEnvKey | "VITE_SUPABASE_ANON_KEY", unknown>>;

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

function resolveSupabasePublishableKey(env: SupabasePublicEnv) {
  return sanitizeEnvValue(env.VITE_SUPABASE_PUBLISHABLE_KEY) || sanitizeEnvValue(env.VITE_SUPABASE_ANON_KEY);
}

export function getMissingSupabasePublicEnvKeys(env: SupabasePublicEnv) {
  const missing: string[] = [];
  if (!sanitizeEnvValue(env.VITE_SUPABASE_URL)) missing.push("VITE_SUPABASE_URL");
  if (!resolveSupabasePublishableKey(env)) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY");
  return missing;
}

export function readSupabasePublicEnv(
  env: SupabasePublicEnv,
  context: string,
) {
  const url = sanitizeEnvValue(env.VITE_SUPABASE_URL);
  const publishableKey = resolveSupabasePublishableKey(env);
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
