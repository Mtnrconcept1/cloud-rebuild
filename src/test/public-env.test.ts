import { describe, expect, it } from "vitest";

import {
  getMissingSupabasePublicEnvKeys,
  readSupabasePublicEnv,
  sanitizeEnvValue,
} from "@/lib/publicEnv";

describe("public env", () => {
  it("sanitizes quoted env values", () => {
    expect(sanitizeEnvValue('  "https://example.supabase.co"  ')).toBe("https://example.supabase.co");
    expect(sanitizeEnvValue("  'publishable-key'  ")).toBe("publishable-key");
  });

  it("detects missing required supabase public env keys", () => {
    expect(
      getMissingSupabasePublicEnvKeys({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY"]);
  });

  it("accepts the legacy anon key as the Supabase publishable key fallback", () => {
    expect(
      getMissingSupabasePublicEnvKeys({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
        VITE_SUPABASE_ANON_KEY: "anon-fallback",
      }),
    ).toEqual([]);
  });

  it("throws a helpful error when required supabase env values are missing", () => {
    expect(() =>
      readSupabasePublicEnv(
        {
          VITE_SUPABASE_URL: "",
          VITE_SUPABASE_PUBLISHABLE_KEY: "",
        },
        "production build",
      ),
    ).toThrow(
      "Missing required Supabase public environment variables for production build: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  });
});
