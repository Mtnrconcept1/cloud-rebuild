import { describe, expect, it } from "vitest";
import { syncTokOneSubscriptionRecord } from "../../supabase/functions/_shared/tok-one";

type Row = Record<string, unknown>;

function harness(initialRows: Row[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const writes: Array<{ operation: "insert" | "update"; payload: Row }> = [];
  const adminClient = {
    from: (table: string) => {
      if (table !== "tok_one_subscriptions") throw new Error(`Unexpected table: ${table}`);
      const filters: Array<(row: Row) => boolean> = [];
      let payload: Row | null = null;
      let operation: "insert" | "update" | null = null;
      let latestOnly = false;
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.push((row) => row[field] === value); return query; },
        is: (field: string, value: unknown) => { filters.push((row) => row[field] === value); return query; },
        order: () => { latestOnly = true; return query; },
        limit: () => query,
        update: (value: Row) => { payload = value; operation = "update"; return query; },
        insert: (value: Row) => { payload = value; operation = "insert"; return query; },
        maybeSingle: async () => {
          const matches = rows.filter((row) => filters.every((match) => match(row)));
          if (latestOnly) matches.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
          return { data: matches[0] ? { ...matches[0] } : null, error: null };
        },
        single: async () => {
          if (!payload || !operation) throw new Error("Missing mutation");
          writes.push({ operation, payload });
          const row = operation === "insert"
            ? { id: `inserted-${rows.length}`, created_at: "2026-10-27T00:00:00Z", ...payload }
            : rows.find((candidate) => filters.every((match) => match(candidate)));
          if (!row) throw new Error("Missing target");
          if (operation === "insert") rows.push(row);
          else Object.assign(row, payload);
          return { data: { ...row }, error: null };
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof syncTokOneSubscriptionRecord>[0]["adminClient"];
  return { rows, writes, adminClient };
}

function localRow(overrides: Row = {}) {
  return {
    id: "local-current", user_id: "user", plan_id: "plan", status: "active",
    stripe_subscription_id: "sub-current", stripe_mode: "live", billing_provider: "stripe",
    stripe_checkout_session_id: "cs-current", current_period_end: "2026-11-27T00:00:00Z",
    created_at: "2026-10-27T00:00:00Z", ...overrides,
  };
}

function stripeSubscription(overrides: Row = {}) {
  return {
    id: "sub-current", status: "active", cancel_at_period_end: false,
    metadata: { checkout_kind: "tok-one", user_id: "user", plan_id: "plan" },
    items: { data: [{ current_period_start: 1793059200, current_period_end: 1795737600 }] },
    ...overrides,
  } as unknown as Parameters<typeof syncTokOneSubscriptionRecord>[0]["subscription"];
}

describe("TOK One Stripe subscription identity", () => {
  it.each(["canceled", "active"])("does not rebind a replacement to a delayed old %s subscription", async (status) => {
    const h = harness([localRow()]);
    const result = await syncTokOneSubscriptionRecord({
      adminClient: h.adminClient, subscription: stripeSubscription({ id: "sub-old", status }), stripeMode: "live",
    });
    expect(result.updated).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.rows[0]).toMatchObject({ stripe_subscription_id: "sub-current", status: "active" });
  });

  it("updates a known old subscription without changing its newer replacement", async () => {
    const h = harness([
      localRow({ id: "local-old", stripe_subscription_id: "sub-old", stripe_checkout_session_id: "cs-old", created_at: "2026-09-27T00:00:00Z" }),
      localRow(),
    ]);
    await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ id: "sub-old", status: "canceled" }), stripeMode: "live" });
    expect(h.rows[0]).toMatchObject({ stripe_subscription_id: "sub-old", status: "cancelled" });
    expect(h.rows[1]).toMatchObject({ stripe_subscription_id: "sub-current", status: "active" });
  });

  it("binds the first Stripe subscription to an unbound checkout placeholder", async () => {
    const h = harness([localRow({ stripe_subscription_id: null, status: "inactive" })]);
    const result = await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription(), stripeMode: "live" });
    expect(result.updated).toBe(true);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ id: "local-current", stripe_subscription_id: "sub-current", status: "active" });
  });

  it("does not overwrite a concurrent first Stripe binding", async () => {
    const h = harness([localRow({ stripe_subscription_id: null, status: "inactive" })]);
    const outcomes = await Promise.allSettled(["sub-first", "sub-second"].map((id) =>
      syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ id }), stripeMode: "live" }),
    ));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].stripe_subscription_id).toBe("sub-first");
  });

  it("keeps both Stripe identities when a customer subscribes again after cancellation", async () => {
    const h = harness([localRow({ stripe_subscription_id: "sub-old", stripe_checkout_session_id: "cs-old", status: "cancelled", created_at: "2026-09-27T00:00:00Z" })]);
    const result = await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription(), stripeMode: "live", stripeCheckoutSessionId: "cs-current" });
    expect(result.updated).toBe(true);
    expect(h.rows).toHaveLength(2);
    expect(h.rows[0]).toMatchObject({ stripe_subscription_id: "sub-old", status: "cancelled", stripe_checkout_session_id: "cs-old" });
    expect(h.rows[1]).toMatchObject({ stripe_subscription_id: "sub-current", status: "active", stripe_checkout_session_id: "cs-current" });
    await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ id: "sub-old", status: "canceled" }), stripeMode: "live" });
    expect(h.rows[1]).toMatchObject({ stripe_subscription_id: "sub-current", status: "active" });
  });

  it("inserts a first subscription and isolates test mode from the live binding", async () => {
    const h = harness([localRow()]);
    const result = await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ id: "sub-test" }), stripeMode: "test", stripeCheckoutSessionId: "cs-test" });
    expect(result.updated).toBe(true);
    expect(h.rows).toHaveLength(2);
    expect(h.rows[0]).toMatchObject({ stripe_subscription_id: "sub-current", stripe_mode: "live" });
    expect(h.rows[1]).toMatchObject({ stripe_subscription_id: "sub-test", stripe_mode: "test", stripe_checkout_session_id: "cs-test" });
  });

  it("preserves legacy subscriptions without checkout_kind and Apple records", async () => {
    const h = harness([localRow({ billing_provider: "apple", stripe_subscription_id: null })]);
    const result = await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ metadata: { user_id: "user", plan_id: "plan" } }), stripeMode: "live" });
    expect(result.updated).toBe(true);
    expect(h.rows).toHaveLength(2);
    expect(h.rows[0]).toMatchObject({ billing_provider: "apple", stripe_subscription_id: null });
    expect(h.rows[1]).toMatchObject({ billing_provider: "stripe", stripe_subscription_id: "sub-current" });
  });
});

describe("TOK One subscription dispatch", () => {
  it.each(["restaurant-onboarding", "restaurant-subscription-upgrade", "restaurant-subscription-sync"])("leaves %s events to the restaurant sync", async (checkout_kind) => {
    const h = harness();
    const result = await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ metadata: { checkout_kind, user_id: "owner", plan_id: "restaurant-plan", restaurant_id: "restaurant", restaurant_subscription_plan_id: "restaurant-plan" } }), stripeMode: "live" });
    expect(result).toEqual({ updated: false, row: null });
    expect(h.writes).toEqual([]);
  });

  it("recognizes legacy restaurant subscription metadata without checkout_kind", async () => {
    const h = harness();
    const result = await syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ metadata: { user_id: "owner", plan_id: "restaurant-plan", restaurant_subscription_plan_id: "restaurant-plan" } }), stripeMode: "live" });
    expect(result).toEqual({ updated: false, row: null });
    expect(h.writes).toEqual([]);
  });

  it("surfaces malformed explicit TOK One events for webhook retry", async () => {
    const h = harness();
    await expect(syncTokOneSubscriptionRecord({ adminClient: h.adminClient, subscription: stripeSubscription({ metadata: { checkout_kind: "tok-one", user_id: "user" } }), stripeMode: "live" })).rejects.toThrow("TOK_ONE_SUBSCRIPTION_IDENTITY_MISSING");
    expect(h.writes).toEqual([]);
  });
});
