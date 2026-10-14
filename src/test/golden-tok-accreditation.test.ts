import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("La Tok d’Or — restaurant picker and media", () => {
  it("searches the whole catalogue with paginated server queries instead of a fixed 200 restaurant limit", () => {
    const picker = source("src/components/admin/RestaurantSearchSelect.tsx");
    const management = source("src/pages/admin/DropsManagement.tsx");
    expect(picker).toContain("useInfiniteQuery");
    expect(picker).toContain('.ilike("name"');
    expect(picker).toContain(".range(");
    expect(picker).toContain("Afficher davantage");
    expect(management).toContain("<RestaurantSearchSelect");
    expect(management).not.toContain(".limit(200)");
  });

  it("uses the existing protected storage uploader in both admin and restaurant dashboards", () => {
    const management = source("src/pages/admin/DropsManagement.tsx");
    const panel = source("src/components/dashboard/GoldenTokPanel.tsx");
    const uploader = source("src/components/ImageUpload.tsx");
    for (const file of [management, panel]) {
      expect(file).toContain("<ImageUpload");
      expect(file).toContain('bucket="restaurant-images"');
    }
    expect(management).not.toContain("<Label>Image URL</Label>");
    expect(uploader).toContain("assertSafeFileUpload");
    expect(uploader).toContain("optimizeImageUpload");
  });
});

describe("La Tok d’Or — paid accreditation access rules", () => {
  const migration = source("supabase/migrations/20261014030000_golden_tok_accreditations.sql");

  it("requires ownership for application and audited administrator approval", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.golden_tok_accreditations");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("auth_owns_restaurant(p_restaurant_id)");
    expect(migration).toContain("auth_is_admin()");
    expect(migration).toContain("apply_golden_tok_accreditation");
    expect(migration).toContain("admin_review_golden_tok_accreditation");
    expect(migration).toContain("INSERT INTO public.audit_log");
    expect(source("src/pages/admin/DropsManagement.tsx")).toContain("<GoldenTokReviewPanel");
  });

  it("grants owner-side publishing only after live Stripe payment and blocks edits to sold offers", () => {
    expect(migration).toContain("restaurant_save_golden_tok_drop");
    expect(migration).toContain("SET search_path = public, pg_temp AS $golden$");
    expect(migration).toContain("$golden$;");
    expect(migration).toContain("checkout_request_id uuid");
    expect(migration).toContain("a.subscription_status = 'active'");
    expect(migration).toContain("a.stripe_mode = 'live'");
    expect(migration).toContain("a.current_period_end > now()");
    expect(migration).toContain("v_old.total_portions > v_old.remaining_portions");
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.chef_table_drops FROM authenticated/);
    expect(source("supabase/functions/create-checkout/index.ts")).toContain('rpc("golden_tok_restaurant_is_paid"');
  });

  it("isolates Golden TOK Stripe events from normal restaurant subscriptions", () => {
    const checkout = source("supabase/functions/golden-tok-membership/index.ts");
    const webhook = source("supabase/functions/stripe-webhook/index.ts");
    expect(checkout).toContain("GOLDEN_TOK_STRIPE_PRICE_ID");
    expect(checkout).toContain('GOLDEN_TOK_PRODUCT_ID = "prod_VRAz7tfJkO2vAu"');
    expect(checkout).toContain('GOLDEN_TOK_PRICE_ID = "price_1UQIdzGTQigE34suvtFQxQa5"');
    expect(checkout).toContain("GOLDEN_TOK_MONTHLY_CENTS = 9_900");
    expect(checkout).toContain("price.unit_amount !== GOLDEN_TOK_MONTHLY_CENTS");
    expect(checkout).toContain("price.product !== GOLDEN_TOK_PRODUCT_ID");
    expect(source("src/components/dashboard/GoldenTokPanel.tsx")).toContain("99 CHF/mois");
    expect(checkout).toContain('price.recurring?.interval !== "month"');
    expect(checkout).toContain('mode: "subscription"');
    expect(checkout).toContain('requireRestaurantAccess(actor, restaurantId)');
    expect(webhook).toContain('checkoutKind === "golden-tok-accreditation"');
    expect(webhook).toContain("await markStripeWebhookEventSucceeded");
    expect(webhook).toContain('subscription.metadata?.checkout_kind !== "golden-tok-accreditation"');
  });

  it("keeps the application feature within the existing restaurant dashboard route", () => {
    expect(source("src/pages/dashboard/DashboardFormules.tsx")).toContain("<GoldenTokPanel");
    expect(source("src/components/dashboard/GoldenTokPanel.tsx")).toContain("apply_golden_tok_accreditation");
    expect(source("src/components/dashboard/GoldenTokPanel.tsx")).toContain("restaurant_save_golden_tok_drop");
  });
});
