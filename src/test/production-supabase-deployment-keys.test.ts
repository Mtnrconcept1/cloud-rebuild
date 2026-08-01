import { describe, expect, it } from "vitest";

import {
  formatGitHubEnvironment,
  selectSupabaseDeploymentKeys,
} from "../../scripts/write-production-supabase-keys-env.mjs";

describe("production Supabase deployment keys", () => {
  it("prefers the modern publishable key while preserving the legacy server key", () => {
    const selected = selectSupabaseDeploymentKeys([
      {
        name: "anon",
        type: "legacy",
        api_key: "legacy.anon.key",
      },
      {
        name: "service_role",
        type: "legacy",
        api_key: "legacy.service.key",
      },
      {
        name: "default",
        type: "publishable",
        api_key: "sb_publishable_example",
      },
      {
        name: "backend",
        type: "secret",
        api_key: "sb_secret_example",
      },
    ]);

    expect(selected).toEqual({
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      SUPABASE_ANON_KEY: "legacy.anon.key",
      SUPABASE_SERVICE_ROLE_KEY: "legacy.service.key",
    });
  });

  it("falls back to modern keys when legacy keys are unavailable", () => {
    const selected = selectSupabaseDeploymentKeys({
      keys: [
        {
          name: "default",
          type: "publishable",
          api_key: "sb_publishable_example",
        },
        {
          name: "backend",
          type: "secret",
          api_key: "sb_secret_example",
        },
      ],
    });

    expect(selected).toEqual({
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      SUPABASE_ANON_KEY: "sb_publishable_example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
    });
  });

  it("ignores disabled keys and rejects incomplete responses", () => {
    expect(() => selectSupabaseDeploymentKeys([
      {
        name: "anon",
        type: "legacy",
        api_key: "legacy.anon.key",
      },
      {
        name: "service_role",
        type: "legacy",
        api_key: "legacy.service.key",
        disabled: true,
      },
    ])).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("writes a GitHub environment payload without exposing unsupported characters", () => {
    expect(formatGitHubEnvironment({
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      SUPABASE_ANON_KEY: "legacy.anon.key",
      SUPABASE_SERVICE_ROLE_KEY: "legacy.service.key",
    })).toBe(
      "SUPABASE_PUBLISHABLE_KEY=sb_publishable_example\n"
      + "SUPABASE_ANON_KEY=legacy.anon.key\n"
      + "SUPABASE_SERVICE_ROLE_KEY=legacy.service.key\n",
    );

    expect(() => selectSupabaseDeploymentKeys([
      {
        name: "anon",
        type: "legacy",
        api_key: "legacy.anon.key",
      },
      {
        name: "service_role",
        type: "legacy",
        api_key: "unsafe\nvalue",
      },
    ])).toThrow("unsupported characters");
  });
});
