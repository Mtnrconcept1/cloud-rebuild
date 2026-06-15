import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsSource = readdirSync(resolve(root, "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(resolve(root, "supabase/migrations", file), "utf8"))
  .join("\n");
const orderPricingSource = readFileSync(resolve(root, "supabase/functions/_shared/order-pricing.ts"), "utf8");
const createCheckoutSource = readFileSync(resolve(root, "supabase/functions/create-checkout/index.ts"), "utf8");
const loyaltyStatusSource = readFileSync(resolve(root, "src/components/LoyaltyStatus.tsx"), "utf8");
const reservationQueueSource = readFileSync(resolve(root, "src/components/floor-plan/ReservationQueue.tsx"), "utf8");
const refundMutationsSource = readFileSync(resolve(root, "src/lib/refundMutations.ts"), "utf8");
const adminOpsSource = readFileSync(resolve(root, "src/pages/admin/AdminOrdersReservations.tsx"), "utf8");
const profileSource = readFileSync(resolve(root, "src/pages/Profil.tsx"), "utf8");
const courierProfileSource = readFileSync(resolve(root, "src/pages/courier/CourierProfile.tsx"), "utf8");
const courierPortalSource = readFileSync(resolve(root, "supabase/functions/courier-portal/index.ts"), "utf8");
const imageUploadSource = readFileSync(resolve(root, "src/components/ImageUpload.tsx"), "utf8");

describe("Miamz business logic guards", () => {
  it("defines server-side Miamz entitlement effects with restricted execution", () => {
    expect(migrationsSource).toContain("resolve_miamz_benefit_state");
    expect(migrationsSource).toContain("get_user_miamz_benefit_state");
    expect(migrationsSource).toContain("claim_miamz_birthday_bonus");
    expect(migrationsSource).toContain("birthday_bonus");
    expect(migrationsSource).toContain("restaurant_gifts");
    expect(migrationsSource).toContain("premium_refunds");
    expect(migrationsSource).toContain("repair_loyalty_tiers_status");
    expect(migrationsSource).toContain("ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'");
    expect(migrationsSource).toContain("REVOKE EXECUTE ON FUNCTION public.resolve_miamz_benefit_state(uuid) FROM PUBLIC, anon, authenticated");
    expect(migrationsSource).toContain("GRANT EXECUTE ON FUNCTION public.resolve_miamz_benefit_state(uuid) TO service_role");
  });

  it("applies Miamz effects to points, reservations, orders, support and refunds in the database", () => {
    expect(migrationsSource).toContain("CREATE OR REPLACE FUNCTION public.credit_order_loyalty_points()");
    expect(migrationsSource).toContain("CREATE OR REPLACE FUNCTION public.credit_reservation_loyalty_points()");
    expect(migrationsSource).toContain("miamz_points_multiplier");
    expect(migrationsSource).toContain("tg_reservations_apply_miamz_metadata");
    expect(migrationsSource).toContain("tg_orders_apply_miamz_metadata");
    expect(migrationsSource).toContain("tg_support_incidents_apply_miamz_priority");
    expect(migrationsSource).toContain("tg_ai_support_tickets_apply_miamz_priority");
    expect(migrationsSource).toContain("DROP FUNCTION IF EXISTS public.admin_get_refund_queue()");
    expect(migrationsSource).toContain("miamz_priority_score");
    expect(migrationsSource).toContain("miamz_refund_priority");
  });

  it("uses server-authoritative Miamz delivery discounts during Stripe checkout", () => {
    expect(orderPricingSource).toContain("resolveMiamzPricing");
    expect(orderPricingSource).toContain('rpc("resolve_miamz_benefit_state"');
    expect(orderPricingSource).toContain("delivery_fee_boost");
    expect(orderPricingSource).toContain("miamzDeliveryDiscount");
    expect(createCheckoutSource).toContain("miamzDeliveryDiscountTotal");
    expect(createCheckoutSource).toContain("miamz_delivery_discount_amount");
    expect(createCheckoutSource).toContain("miamz_benefits_applied");
  });

  it("keeps VIP Table du Chef threshold metadata but gates checkout through Tok One", () => {
    expect(migrationsSource).toContain("required_miamz_points");
    expect(migrationsSource).toContain("chef_table_drops_vip_miamz_check");
    expect(createCheckoutSource).toContain("required_miamz_points");
    expect(createCheckoutSource).toContain("getLatestTokOneSubscription");
    expect(createCheckoutSource).toContain("hasActiveTokOneSubscription");
    expect(createCheckoutSource).toContain("reserve aux abonnes Tok One actifs");
    expect(createCheckoutSource).not.toContain('.select("loyalty_points")');
  });

  it("exposes active Miamz actions and operational priority badges in the UI", () => {
    expect(loyaltyStatusSource).toContain("claim_miamz_birthday_bonus");
    expect(reservationQueueSource).toContain("getReservationMiamzPriority");
    expect(reservationQueueSource).toContain("Priorite Miamz");
    expect(refundMutationsSource).toContain("miamz_priority_score");
    expect(adminOpsSource).toContain("getRefundMiamzPriorityLabel");
  });

  it("collects birth dates and sends automatic birthday notifications", () => {
    expect(profileSource).toContain("date_of_birth");
    expect(profileSource).toContain("Date de naissance");
    expect(profileSource).toContain('from("user_profiles")');
    expect(courierProfileSource).toContain("date_of_birth");
    expect(courierPortalSource).toContain("normalizeDateOfBirth");
    expect(courierPortalSource).toContain('from("user_profiles")');
    expect(migrationsSource).toContain("enqueue_birthday_notifications");
    expect(migrationsSource).toContain("idx_notifications_birthday_once_year");
    expect(migrationsSource).toContain("tok-birthday-notifications");
  });

  it("keeps manual image URLs hidden by default outside privileged flows", () => {
    expect(imageUploadSource).toContain("showUrlInput = false");
  });
});
