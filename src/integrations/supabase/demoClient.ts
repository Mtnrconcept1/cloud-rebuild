import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const COMMERCIAL_DEMO_SUPABASE_PROJECT_REF = "hzldfhjfgjcadmpghhhf";
export const COMMERCIAL_DEMO_SUPABASE_URL =
  "https://hzldfhjfgjcadmpghhhf.supabase.co";
export const COMMERCIAL_DEMO_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_dOCC1Oh_SQez9sLjrdfbgA_0Frhb-j2";

const COMMERCIAL_DEMO_AUTH_STORAGE_KEY = "tok-commercial-demo-auth";
const COMMERCIAL_DEMO_WORKSPACE_STORAGE_KEY = "tok-active-demo-workspace";
const DEMO_FRAME_PATH =
  /^\/commercial\/demo-live\/frame\/(?:client|restaurant|courier)\/[0-9a-f-]{36}(?:\/|$)/i;
const DEMO_AUTH_PATH = /^\/auth\/demo\/?$/i;
const PRODUCTION_AUTH_PATH = /^\/auth(?:\/callback)?\/?$/i;

let commercialDemoSupabase: SupabaseClient<Database> | null = null;

export function isCommercialDemoFramePath(pathname: string) {
  return DEMO_FRAME_PATH.test(String(pathname || ""));
}

export function isCommercialDemoAuthPath(pathname: string) {
  return DEMO_AUTH_PATH.test(String(pathname || ""));
}

export function activateCommercialDemoWorkspace() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(COMMERCIAL_DEMO_WORKSPACE_STORAGE_KEY, "1");
  } catch {
    // The explicit /auth/demo path remains sufficient for the current load.
  }
}

export function clearCommercialDemoWorkspace() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(COMMERCIAL_DEMO_WORKSPACE_STORAGE_KEY);
  } catch {
    // Hardened browsers may deny storage; no durable marker remains in that case.
  }
}

export function isCommercialDemoWorkspaceActive() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(COMMERCIAL_DEMO_WORKSPACE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function shouldUseCommercialDemoSupabase(pathname: string) {
  const normalizedPath = String(pathname || "");
  if (isCommercialDemoFramePath(normalizedPath)) return true;
  if (isCommercialDemoAuthPath(normalizedPath)) {
    activateCommercialDemoWorkspace();
    return true;
  }
  if (PRODUCTION_AUTH_PATH.test(normalizedPath)) {
    clearCommercialDemoWorkspace();
    return false;
  }
  return isCommercialDemoWorkspaceActive();
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
