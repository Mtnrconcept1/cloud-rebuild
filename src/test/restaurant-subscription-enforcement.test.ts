import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A live/Postgres policy integration check is required before production deploy.
// These source-contract checks prevent accidentally dropping our paywall,
// demo-scope isolation or idempotent notification delivery in a refactor.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261022080000_restaurant_subscription_enforcement_and_reminders.sql");
const owner = read("src/pages/dashboard/useOwnerRestaurants.ts");
const context = read("src/pages/dashboard/DashboardContext.tsx");
const credits = read("supabase/functions/_shared/restaurant-credits.ts");
const campaignPortal = read("supabase/functions/campaign-portal/index.ts");
const sponsoredPost = read("supabase/functions/create-social-post-boost/index.ts");

describe("restaurant subscription expiry and renewal", () => {
  it("requires real paid/live current subscription once any history exists", () => {
    expect(migration).toContain("NOT EXISTS (");
    expect(migration).toContain("paid.status IN ('active', 'trialing')");
    expect(migration).toContain("paid.current_period_end > now()");
    expect(migration).toContain("paid.stripe_mode = 'live'");
    expect(migration).toContain("paid.stripe_subscription_id IS NOT NULL");
  });

  it("filters public RLS and catalog without blocking owner, demo and admin recovery", () => {
    expect(migration).toContain("restaurant_is_publicly_visible");
    expect(migration).toContain("restaurant_subscription_has_paid_access(restaurant.id)");
    expect(migration).toContain("ALTER POLICY %I ON public.restaurants");
    for (const policy of [
      "restaurants_public_select",
      "production_hide_demo_restaurants",
      "scope_production_restaurants_for_commercial_demo_accounts",
    ]) {
      expect(migration).toContain(policy);
    }
    expect(migration).not.toContain("DROP POLICY");
  });

  it("preserves ended subscription history to keep the dashboard recovery paywall active", () => {
    expect(owner).toContain("Keep ended subscriptions in the owner workspace");
    expect(context).toContain("const subscriptionExpired = subscriptionEnabledFeatures.length === 0");
    expect(context).toContain('"dashboard-factures"');
    expect(context).toContain("lockedFeatures.add(feature.key)");
    expect(credits).toContain('if (paidAccess !== true) throw new HttpError(402, "restaurant_subscription_inactive")');
  });

  it("deduplicates J-5/J-1 Swiss-date transactional emails and in-app notices", () => {
    expect(migration).toContain("days_before integer NOT NULL CHECK (days_before IN (1, 5))");
    expect(migration).toContain("PRIMARY KEY (subscription_id, period_end, days_before)");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).toContain("AT TIME ZONE 'Europe/Zurich'");
    expect(migration).toContain("'transactional'");
    expect(migration).toContain("'in_app', true, 'email', true");
    expect(migration).toContain("'/dashboard/mon-compte-facturation'");
    expect(migration).toContain("tok-restaurant-subscription-reminders");
  });

  it("fails closed when restaurant subscription entitlements cannot be refreshed", () => {
    expect(owner).toContain('throw new Error("restaurant_subscription_entitlements_unavailable")');
    expect(owner).toContain("const restaurants = error ? [] : data || []");
  });

  it("blocks premium API mutations, not merely their dashboard buttons", () => {
    expect(credits).toContain("export async function requireRestaurantSubscriptionPaidAccess");
    expect(credits).toContain("await requireRestaurantSubscriptionPaidAccess(adminClient, restaurantId)");
    expect(campaignPortal).toMatch(/if \(action === "save"\) \{[\s\S]{0,220}await requireRestaurantSubscriptionPaidAccess\(adminClient, restaurant\.id\)/);
    expect(campaignPortal).toMatch(/if \(nextStatus === "active"\) \{\s*await requireRestaurantSubscriptionPaidAccess\(adminClient, restaurant\.id\)/);
    expect(sponsoredPost).toMatch(/const adminClient = actor\.adminClient;[\s\S]{0,220}await requireRestaurantSubscriptionPaidAccess\(adminClient, restaurant\.id\)/);
    // Read-only history and campaign cancellation remain possible.
    expect(campaignPortal.indexOf('if (action === "list")')).toBeLessThan(campaignPortal.indexOf('if (action === "save")'));
    expect(campaignPortal).toContain('if (action === "delete")');
  });
});
