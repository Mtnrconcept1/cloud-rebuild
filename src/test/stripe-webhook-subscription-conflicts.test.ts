import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
const conflictSource = source.slice(
  source.indexOf("async function assertNoTrackedSubscriptionConflict("),
  source.indexOf("function buildPaidTokInvoiceNumber("),
);
const compiled = ts.transpileModule(conflictSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const assertNoConflict = new Function(`${compiled}; return assertNoTrackedSubscriptionConflict;`)() as (
  input: { adminClient: unknown; subscription: Record<string, unknown> },
) => Promise<void>;

type Row = Record<string, unknown>;

function harness(rows: Record<string, Row[]> = {}) {
  const reads: Array<{ table: string; equalities: Row }> = [];
  const adminClient = { from: (table: string) => {
    const equalities: Row = {};
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { equalities[key] = value; filters.push((row) => row[key] === value); return query; },
      neq: (key: string, value: unknown) => { filters.push((row) => row[key] != null && row[key] !== value); return query; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
      limit: async (count: number) => {
        reads.push({ table, equalities });
        return { data: (rows[table] || []).filter((row) => filters.every((match) => match(row))).slice(0, count), error: null };
      },
    };
    return query;
  } };
  return { reads, run: (subscription: Record<string, unknown>) => assertNoConflict({ adminClient, subscription }) };
}

function tokOneRow(overrides: Row = {}) {
  return { id: "tok-one-row", user_id: "owner", stripe_subscription_id: "sub-existing", stripe_mode: "live", billing_provider: "stripe", status: "active", ...overrides };
}

function restaurantRow(overrides: Row = {}) {
  return { id: "restaurant-row", restaurant_id: "restaurant", stripe_subscription_id: "sub-existing", stripe_mode: "live", status: "active", ...overrides };
}

function subscription(kind = "tok-one", overrides: Row = {}) {
  return { id: "sub-incoming", livemode: true, metadata: {
    checkout_kind: kind, user_id: "owner", stripe_mode: "live",
    ...(kind.startsWith("restaurant-") ? { restaurant_id: "restaurant", restaurant_subscription_plan_id: "restaurant-plan" } : { plan_id: "user-plan" }),
  }, ...overrides };
}

describe("Stripe webhook subscription conflicts", () => {
  it.each(["restaurant-onboarding", "restaurant-subscription-upgrade"])("allows %s for an owner who also has TOK One", async (kind) => {
    const h = harness({ tok_one_subscriptions: [tokOneRow()] });
    await expect(h.run(subscription(kind))).resolves.toBeUndefined();
    expect(h.reads.map((read) => read.table)).toEqual(["restaurant_ai_subscriptions"]);
  });

  it("classifies legacy restaurant metadata before checking TOK One identity", async () => {
    const h = harness({ tok_one_subscriptions: [tokOneRow()] });
    await expect(h.run(subscription("restaurant-onboarding", { metadata: { user_id: "owner", restaurant_id: "restaurant", restaurant_subscription_plan_id: "restaurant-plan" } }))).resolves.toBeUndefined();
    expect(h.reads.map((read) => read.table)).toEqual(["restaurant_ai_subscriptions"]);
  });

  it("still rejects a different TOK One Stripe subscription in the same mode", async () => {
    const h = harness({ tok_one_subscriptions: [tokOneRow()] });
    await expect(h.run(subscription())).rejects.toThrow("TOK_ONE_SUBSCRIPTION_IDENTITY_CONFLICT:sub-existing:sub-incoming");
  });

  it("still rejects a different restaurant Stripe subscription in the same mode", async () => {
    const h = harness({ restaurant_ai_subscriptions: [restaurantRow()] });
    await expect(h.run(subscription("restaurant-onboarding"))).rejects.toThrow("RESTAURANT_SUBSCRIPTION_IDENTITY_CONFLICT:sub-existing:sub-incoming");
  });

  it("preserves the authorized previous restaurant subscription during replacement", async () => {
    const h = harness({ restaurant_ai_subscriptions: [restaurantRow()] });
    const incoming = subscription("restaurant-subscription-upgrade");
    await expect(h.run({ ...incoming, metadata: { ...incoming.metadata, previous_stripe_subscription_id: "sub-existing" } })).resolves.toBeUndefined();
  });

  it.each(["tok-one", "restaurant-onboarding"])("isolates %s conflicts using provider mode rather than metadata", async (kind) => {
    const h = harness({
      tok_one_subscriptions: [tokOneRow({ stripe_mode: "test" })],
      restaurant_ai_subscriptions: [restaurantRow({ stripe_mode: "test" })],
    });
    const incoming = subscription(kind);
    await expect(h.run({ ...incoming, metadata: { ...incoming.metadata, stripe_mode: "test" } })).resolves.toBeUndefined();
    expect(h.reads.every((read) => read.equalities.stripe_mode === "live")).toBe(true);
  });

  it.each(["tok-one", "restaurant-onboarding"])("isolates test %s from live subscriptions", async (kind) => {
    const h = harness({ tok_one_subscriptions: [tokOneRow()], restaurant_ai_subscriptions: [restaurantRow()] });
    await expect(h.run(subscription(kind, { livemode: false }))).resolves.toBeUndefined();
    expect(h.reads.every((read) => read.equalities.stripe_mode === "test")).toBe(true);
  });

  it("keeps legacy TOK One conflicts protected and ignores non-Stripe identities", async () => {
    const h = harness({ tok_one_subscriptions: [tokOneRow({ billing_provider: "apple", stripe_subscription_id: null })] });
    await expect(h.run(subscription("tok-one", { metadata: { user_id: "owner", plan_id: "plan" } }))).resolves.toBeUndefined();
    const conflicting = harness({ tok_one_subscriptions: [tokOneRow()] });
    await expect(conflicting.run(subscription("tok-one", { metadata: { user_id: "owner", plan_id: "plan" } }))).rejects.toThrow("TOK_ONE_SUBSCRIPTION_IDENTITY_CONFLICT");
  });
});
