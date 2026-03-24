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
  return stripWrappingQuotes(value).replace(/[\r\n]+/g, "").trim();
}

export const SUPABASE_URL = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const FIREBASE_API_KEY = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_API_KEY);
export const FIREBASE_AUTH_DOMAIN = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
export const FIREBASE_PROJECT_ID = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID);
export const FIREBASE_STORAGE_BUCKET = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
export const FIREBASE_MESSAGING_SENDER_ID = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID);
export const FIREBASE_APP_ID = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_APP_ID);
export const FIREBASE_VAPID_KEY = sanitizeEnvValue(
  import.meta.env.VITE_FCM_VAPID_KEY || import.meta.env.VITE_FIREBASE_VAPID_KEY,
);
