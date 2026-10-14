import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = read("supabase/migrations/20261014153000_admin_ai_gifts_fast_restaurants.sql");
const admin = read("src/pages/admin/AdminRestaurants.tsx");
const picker = read("src/components/admin/RestaurantSearchSelect.tsx");
const dialog = read("src/components/admin/AdminGiftAiCreditsDialog.tsx");
const billing = read("src/pages/dashboard/DashboardAccountBilling.tsx");

describe("admin restaurant search performance", () => {
  it("uses existing lower(name)/lower(city) trigram indexes and adds sort/menu indexes", () => {
    expect(sql).toContain("idx_restaurants_admin_name_id");
    expect(sql).toContain("idx_menu_items_restaurant_available");
    expect(sql).toContain("ON public.menu_items (restaurant_id) WHERE is_available IS TRUE");
    expect(sql).toContain("lower(r.name) LIKE v_pattern");
    expect(sql).toContain("lower(r.city) LIKE v_pattern");
    expect(sql).toContain("replace(replace(replace(v_query, chr(92)");
    expect(sql).not.toContain("CREATE INDEX restaurants_name_trgm_idx");
  });

  it("never loads the entire restaurant catalogue or all menus into the admin browser", () => {
    expect(admin).toContain("admin_restaurants_page_fast");
    expect(admin).toContain("admin_restaurant_stats_fast");
    expect(admin).toContain("p_offset: page * RESTAURANT_PAGE_SIZE");
    expect(admin).toContain("setDebouncedSearch");
    expect(admin).toContain("setPage(0)");
    expect(admin).not.toContain('.in("restaurant_id", restaurantIds)');
    expect(admin).not.toContain('.from("restaurants")\n        .select(');
    expect(admin).toContain("Précédent");
    expect(admin).toContain("Suivant");
    expect(sql).toContain("LIMIT v_limit OFFSET v_offset");
  });

  it("debounces and paginates searchable comboboxes without exact count per keystroke", () => {
    expect(picker).toContain("useInfiniteQuery");
    expect(picker).toContain("180");
    expect(picker).toContain("admin_search_restaurants_fast");
    expect(picker).toContain("p_limit: PAGE_SIZE + 1");
    expect(picker).toContain("p_offset: pageParam * PAGE_SIZE");
    expect(picker).toContain("eligibleOnly");
    expect(picker).not.toContain('count: "exact"');
    expect(picker).toContain("getNextPageParam");
  });
});

describe("admin-only gift AI credits", () => {
  it("validates admins, restaurant eligibility, amount, reason and retries server side", () => {
    expect(sql).toContain("public.admin_grant_restaurant_ai_credits(");
    expect(sql).toContain("public.has_role(v_admin, 'admin')");
    expect(sql).toContain("p_credits NOT BETWEEN 1 AND 10000");
    expect(sql).toContain("char_length(v_reason) NOT BETWEEN 8 AND 500");
    expect(sql).toContain("r.is_directory_listing IS FALSE");
    expect(sql).toContain("r.is_demo IS FALSE");
    expect(sql).toContain("ON CONFLICT (request_id) DO NOTHING");
    expect(sql).toContain("ai_gift_idempotency_conflict");
    expect(sql).toContain("'admin_gift_ai_credits'");
    expect(sql).toContain("'admin_non_stripe_gift'");
  });

  it("protects balances and spends in private RLS tables", () => {
    expect(sql).toContain("private_finance.admin_ai_credit_grants");
    expect(sql).toContain("private_finance.admin_ai_credit_spends");
    expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.restaurant_credit_purchases/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.restaurant_ai_subscriptions/i);
  });

  it("consumes gifts atomically without draining purchased AI packs or funding campaigns", () => {
    expect(sql).toContain("private_finance.chargeable_ai_usage_logs");
    expect(sql).toContain("gift_spend.usage_id = logged.id");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("admin_ai_credit_spends (usage_id,grant_id,credits)");
    expect(sql).toContain("get_restaurant_credit_usage_before_internal_ai_grant");
    expect(sql).toContain("zz_admin_protect_gift_campaign");
    expect(sql).toContain("campaign_spendable_balance");
    expect(sql).toContain("IF v_required > v_available THEN");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.ai_usage_logs/i);
  });

  it("preserves feature flags and app subscription quota while allowing gifted AI use", () => {
    expect(sql).toContain("check_restaurant_ai_quota_before_admin_ai_gifts");
    expect(sql).toContain("v_original->>'reason' IN ('feature_disabled','restaurant_required')");
    expect(sql).toContain("v_gift < greatest(coalesce(p_units,1),1)");
    expect(sql).toContain("'ai_gift_balance'");
    expect(sql).toContain("'real_tok_balance'");
    expect(sql).toContain("'campaign_spendable_balance'");
  });

  it("requires a confirmation and displays a gift audit/history without Stripe checkout", () => {
    expect(admin).toContain("<AdminGiftAiCreditsDialog");
    expect(admin).toContain("Offrir des crédits IA");
    expect(dialog).toContain("<RestaurantSearchSelect");
    expect(dialog).toContain("eligibleOnly");
    expect(dialog).toContain("admin_grant_restaurant_ai_credits");
    expect(dialog).toContain("admin_list_restaurant_ai_gifts");
    expect(dialog).toContain("crypto.randomUUID()");
    expect(dialog).toContain("<AlertDialog");
    expect(dialog).toContain("Confirmer l'attribution");
    expect(dialog).not.toContain("create-checkout");
    expect(billing).toContain("ai_gift_balance");
    expect(billing).toContain("campagnes");
  });
});
