import { describe, expect, it } from "vitest";
import { ISOLATED_TEST_PROJECT_REF, resolveIsolatedTestEnvironment } from "../../supabase/functions/_shared/isolated-test-environment";

const testConfig = {
  SUPABASE_URL: `https://${ISOLATED_TEST_PROJECT_REF}.supabase.co`,
  TOK_ISOLATED_TEST_MODE: "true",
  STRIPE_SECRET_KEY_TEST: "sk_test_synthetic",
};
const resolve = (config: Record<string, string>) => resolveIsolatedTestEnvironment((name) => config[name]);
describe("isolated native Stripe Test environment", () => {
  it("preserves production without an opt-in", () => {
    expect(resolve({ SUPABASE_URL: "https://wwcrtyoueexyxkkikaos.supabase.co" })).toBe(false);
  });
  it("requires the exact authorized project plus explicit opt-in and actual Test key", () => {
    expect(resolve(testConfig)).toBe(true);
    for (const override of [
      { SUPABASE_URL: "https://wwcrtyoueexyxkkikaos.supabase.co" },
      { SUPABASE_URL: "https://example.supabase.co" },
      { SUPABASE_PROJECT_REF: "wwcrtyoueexyxkkikaos" },
      { TOK_ISOLATED_TEST_MODE: "false" },
      { STRIPE_SECRET_KEY_TEST: "sk_live_synthetic" },
      { STRIPE_SECRET_KEY_TEST: "rk_test_synthetic" },
      { STRIPE_SECRET_KEY_TEST: "" },
    ]) expect(() => resolve({ ...testConfig, ...override })).toThrow();
  });
});
