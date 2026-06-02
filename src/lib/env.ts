export { sanitizeEnvValue } from "@/lib/publicEnv";

import { sanitizeEnvValue } from "@/lib/publicEnv";

export const SUPABASE_URL = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = sanitizeEnvValue(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const FIREBASE_API_KEY = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_API_KEY);
export const FIREBASE_AUTH_DOMAIN = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
export const FIREBASE_PROJECT_ID = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID);
export const FIREBASE_STORAGE_BUCKET = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
export const FIREBASE_MESSAGING_SENDER_ID = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID);
export const FIREBASE_APP_ID = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_APP_ID);
export const FIREBASE_VAPID_KEY = sanitizeEnvValue(
  import.meta.env.VITE_FCM_VAPID_KEY || import.meta.env.VITE_FIREBASE_VAPID_KEY,
);
