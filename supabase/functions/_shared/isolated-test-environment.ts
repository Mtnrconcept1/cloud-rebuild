// This temporary backend is explicitly authorized for synthetic Stripe Test tests.
export const ISOLATED_TEST_PROJECT_REF = "esmsehyxenyqewdfawie";

export function resolveIsolatedTestEnvironment(read: (name: string) => string | undefined): boolean {
  const enabled = read("TOK_ISOLATED_TEST_MODE");
  const url = read("SUPABASE_URL") || "";
  const ref = read("SUPABASE_PROJECT_REF");
  const target = url === `https://${ISOLATED_TEST_PROJECT_REF}.supabase.co`;
  if (!target && enabled !== "true") return false;
  if (!target || enabled !== "true" || (ref && ref !== ISOLATED_TEST_PROJECT_REF)) {
    throw new Error("ISOLATED_TEST_TARGET_MISMATCH");
  }
  if (!(read("STRIPE_SECRET_KEY_TEST") || "").startsWith("sk_test_")) {
    throw new Error("ISOLATED_TEST_STRIPE_KEY_REQUIRED");
  }
  return true;
}

export function isIsolatedTestEnvironment(): boolean {
  return resolveIsolatedTestEnvironment((name) => Deno.env.get(name));
}

export function nativeStripeMode(): "test" | "live" {
  return isIsolatedTestEnvironment() ? "test" : "live";
}
