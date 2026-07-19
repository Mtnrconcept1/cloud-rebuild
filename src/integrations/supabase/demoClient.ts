import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const COMMERCIAL_DEMO_SUPABASE_PROJECT_REF = "hzldfhjfgjcadmpghhhf";
export const COMMERCIAL_DEMO_SUPABASE_URL =
  "https://hzldfhjfgjcadmpghhhf.supabase.co";
export const COMMERCIAL_DEMO_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_dOCC1Oh_SQez9sLjrdfbgA_0Frhb-j2";

const COMMERCIAL_DEMO_AUTH_STORAGE_KEY = "tok-commercial-demo-auth";
const DEMO_FRAME_PATH =
  /^\/commercial\/demo-live\/frame\/(?:client|restaurant|courier)\/[0-9a-f-]{36}\/?$/i;

let commercialDemoSupabase: SupabaseClient<Database> | null = null;

export function isCommercialDemoFramePath(pathname: string) {
  return DEMO_FRAME_PATH.test(String(pathname || ""));
}

export function getCommercialDemoSupabase(): SupabaseClient<Database> {
  if (commercialDemoSupabase) return commercialDemoSupabase;

  commercialDemoSupabase = createClient<Database>(
    COMMERCIAL_DEMO_SUPABASE_URL,
    COMMERCIAL_DEMO_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        storageKey: COMMERCIAL_DEMO_AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    },
  );

  return commercialDemoSupabase;
}
