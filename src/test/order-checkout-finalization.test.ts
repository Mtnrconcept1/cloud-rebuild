import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as delivery from "../../supabase/functions/_shared/delivery-dispatch";
import * as charges from "../../supabase/functions/_shared/payment-transactions";

const compiled = ts.transpileModule(
  readFileSync("supabase/functions/_shared/order-checkout.ts", "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

type Row = Record<string, any>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const orderId = "1ff8258c-c32d-402f-8300-4ed565af9c69";
const session = {
  id: "cs_live_order", amount_total: 3000, currency: "chf", payment_status: "paid",
  payment_intent: "pi_live_order", metadata: { stripe_mode: "live" },
};

function harness(options: {
  status?: string;
  paymentStatus?: string;
  beforeFirstUpdate?: (row: Row) => void;
  updateError?: string;
  failChargeOnce?: boolean;
  failTrackingOnce?: boolean;
} = {}) {
  const row: Row = {
    id: orderId, status: options.status || "pending_payment", payment_status: options.paymentStatus || "pending",
    user_id: null, restaurant_id: "restaurant", delivery_address: "Rue de Lyon 55, 1203 Geneve",
    total_amount: 30, order_number: "TOK-1", scheduled_at: "2026-10-28T18:00:00Z",
    estimated_delivery_at: "2026-10-28T18:30:00Z",
    metadata: { stripe_session_id: session.id, payment_method: "card", delivery_schedule_mode: "scheduled", scheduled_delivery_at: "2026-10-28T18:00:00Z", fulfillment_note: "Keep current instructions" },
  };
  const initial = clone(row);
  const transactions: Row[] = [];
  const orderWrites: Row[] = [];
  const trackingWrites: Row[] = [];
  const trackingRows: Row[] = options.status ? [{ order_id: orderId, status: "delivering", estimated_arrival: row.estimated_delivery_at }] : [];
  const enqueueNotification = vi.fn(async () => {});
  const queueOrderConfirmationEmails = vi.fn(async () => {});
  const triggerNotificationDispatch = vi.fn(async () => {});
  let updateAttempts = 0;
  let chargeAttempts = 0;
  let trackingAttempts = 0;
  const adminClient = {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let patch: Row | null = null;
      const valueAt = (candidate: Row, field: string) => field.includes("->>")
        ? candidate[field.split("->>")[0]]?.[field.split("->>")[1]]
        : candidate[field];
      const matches = (candidate: Row) => filters.every(([field, value]) => JSON.stringify(valueAt(candidate, field)) === JSON.stringify(field === "metadata" && typeof value === "string" ? JSON.parse(value) : value));
      const execute = () => {
        if (table === "orders") {
          if (patch) {
            updateAttempts += 1;
            if (updateAttempts === 1) options.beforeFirstUpdate?.(row);
            if (options.updateError) return { data: null, error: { message: options.updateError } };
            if (!matches(row)) return { data: [], error: null };
            orderWrites.push(clone(patch));
            Object.assign(row, clone(patch));
            return { data: [clone(row)], error: null };
          }
          return { data: matches(row) ? [clone(row)] : [], error: null };
        }
        if (table === "payment_transactions") return { data: transactions.filter(matches).map(clone), error: null };
        if (table === "restaurants") return { data: [{ id: "restaurant", owner_id: "owner", name: "Restaurant" }], error: null };
        if (table === "order_items") return { data: [], error: null };
        throw new Error(`Unexpected table: ${table}`);
      };
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
        is: (field: string, value: unknown) => { filters.push([field, value]); return query; },
        filter: (field: string, _operator: string, value: unknown) => { filters.push([field, value]); return query; },
        limit: () => query,
        update: (value: Row) => { patch = value; return query; },
        maybeSingle: async () => { const result = execute(); return { ...result, data: result.data?.[0] || null }; },
        insert: async (value: Row) => {
          chargeAttempts += 1;
          if (options.failChargeOnce && chargeAttempts === 1) return { error: { message: "charge storage unavailable" } };
          if (transactions.some((entry) => entry.order_id === value.order_id && entry.stripe_checkout_session_id === value.stripe_checkout_session_id)) return { error: { code: "23505" } };
          transactions.push({ id: `charge-${transactions.length + 1}`, ...clone(value) });
          return { error: null };
        },
        upsert: async (value: Row, config?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          trackingAttempts += 1;
          if (options.failTrackingOnce && trackingAttempts === 1) return { error: { message: "tracking storage unavailable" } };
          const existing = trackingRows.find((entry) => entry.order_id === value.order_id);
          if (existing && config?.onConflict === "order_id" && config.ignoreDuplicates) return { error: null };
          trackingWrites.push(clone(value));
          if (existing) Object.assign(existing, clone(value)); else trackingRows.push(clone(value));
          return { error: null };
        },
        then: (resolve: (result: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "restaurant@tok.test" } }, error: null }) } },
  };
  const dependencies: Record<string, unknown> = {
    "./delivery-dispatch.ts": delivery,
    "./notifications.ts": { enqueueNotification, triggerNotificationDispatch },
    "./payment-transactions.ts": charges,
    "./transactional-emails.ts": { queueOrderConfirmationEmails },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", "Deno", compiled)(
    (name: string) => dependencies[name] || {}, exports, { env: { get: () => undefined } },
  );
  return {
    row, initial, transactions, orderWrites, trackingWrites, trackingRows, enqueueNotification, queueOrderConfirmationEmails, triggerNotificationDispatch,
    run: (overrides: Row = {}) => exports.finalizePaidOrderCheckout({ adminClient, session, cardBrand: "visa", cardLast4: "4242", ...overrides }),
  };
}

describe("paid order checkout finalization", () => {
  it.each(["confirmed", "accepted", "preparing", "ready", "delivering", "delivered", "completed", "cancelled", "refused"])(
    "preserves %s orders on completion replay and repairs the missing charge once",
    async (status) => {
      const h = harness({ status, paymentStatus: "captured" });
      const result = await h.run();
      expect(h.row).toEqual(h.initial);
      expect(result).toMatchObject({ newlyFinalized: false, orders: [{ status, payment_status: "captured" }] });
      expect(h.transactions).toMatchObject([{ order_id: orderId, stripe_checkout_session_id: session.id, amount: 30, status: "succeeded" }]);
      expect((await h.run()).newlyFinalized).toBe(false);
      expect(h.transactions).toHaveLength(1);
      expect(h.orderWrites).toHaveLength(0);
      expect(h.trackingWrites).toHaveLength(0);
      expect(h.trackingRows).toMatchObject([{ status: "delivering", estimated_arrival: h.initial.estimated_delivery_at }]);
      expect(h.enqueueNotification).not.toHaveBeenCalled();
      expect(h.queueOrderConfirmationEmails).not.toHaveBeenCalled();
      expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
    },
  );

  it.each(["refunded", "partially_refunded"])("preserves %s payment state on a late completion event", async (paymentStatus) => {
    const h = harness({ status: "cancelled", paymentStatus });
    const result = await h.run();
    expect(h.row).toEqual(h.initial);
    expect(result).toMatchObject({ newlyFinalized: false, orders: [{ status: "cancelled", payment_status: paymentStatus }] });
    expect(h.transactions).toHaveLength(1);
  });

  it("confirms a pending payment and emits fulfillment effects only on the first completion", async () => {
    const h = harness();
    expect(await h.run()).toMatchObject({ newlyFinalized: true, orders: [{ status: "confirmed", payment_status: "captured" }] });
    expect(await h.run()).toMatchObject({ newlyFinalized: false, orders: [{ status: "confirmed", payment_status: "captured" }] });
    expect(h.transactions).toHaveLength(1);
    expect(h.orderWrites).toHaveLength(1);
    expect(h.trackingWrites).toHaveLength(1);
    expect(h.enqueueNotification).toHaveBeenCalledOnce();
    expect(h.queueOrderConfirmationEmails).toHaveBeenCalledOnce();
    expect(h.triggerNotificationDispatch).toHaveBeenCalledOnce();
  });

  it("claims pending fulfillment once across concurrent checkout completions", async () => {
    const h = harness();
    const results = await Promise.all([h.run(), h.run()]);
    expect(results.filter((result) => result.newlyFinalized)).toHaveLength(1);
    expect(h.orderWrites).toHaveLength(1);
    expect(h.transactions).toHaveLength(1);
    expect(h.trackingWrites).toHaveLength(1);
    expect(h.enqueueNotification).toHaveBeenCalledOnce();
  });

  it.each(["charge", "tracking"])("repairs missing scheduled delivery tracking after the first %s write fails", async (failure) => {
    const h = harness({ failChargeOnce: failure === "charge", failTrackingOnce: failure === "tracking" });
    await expect(h.run()).rejects.toMatchObject({ message: `${failure} storage unavailable` });
    expect(h.row).toMatchObject({ status: "confirmed", payment_status: "captured" });
    expect(h.trackingRows).toHaveLength(0);
    expect(await h.run()).toMatchObject({ newlyFinalized: false });
    expect(h.transactions).toHaveLength(1);
    expect(h.trackingRows).toMatchObject([{ order_id: orderId, status: "scheduled" }]);
    h.trackingRows[0].status = "delivering";
    await h.run();
    expect(h.trackingRows[0].status).toBe("delivering");
    expect(h.trackingWrites).toHaveLength(1);
  });

  it("preserves concurrent fulfillment and metadata changes before the payment update", async () => {
    const h = harness({ beforeFirstUpdate: (row) => {
      row.status = "preparing";
      row.payment_status = "captured";
      row.metadata = { ...row.metadata, kitchen_note: "Already being prepared" };
    } });
    const result = await h.run();
    expect(h.row).toMatchObject({ status: "preparing", payment_status: "captured", metadata: { kitchen_note: "Already being prepared" } });
    expect(result).toMatchObject({ newlyFinalized: false, orders: [{ status: "preparing" }] });
    expect(h.orderWrites).toHaveLength(0);
    expect(h.transactions).toHaveLength(1);
    expect(h.enqueueNotification).not.toHaveBeenCalled();
  });

  it("merges the latest metadata when an unpaid order changes during finalization", async () => {
    const h = harness({ beforeFirstUpdate: (row) => { row.metadata = { ...row.metadata, customer_note: "Ring twice" }; } });
    expect(await h.run()).toMatchObject({ newlyFinalized: true });
    expect(h.row).toMatchObject({ status: "confirmed", payment_status: "captured", metadata: { customer_note: "Ring twice", checkout_session_state: "completed" } });
    expect(h.orderWrites).toHaveLength(1);
  });

  it("repairs captured payment evidence without reopening or redispatching a progressed order", async () => {
    const h = harness({ status: "preparing", paymentStatus: "pending" });
    expect(await h.run()).toMatchObject({ newlyFinalized: false, orders: [{ status: "preparing", payment_status: "captured" }] });
    expect(h.row).toMatchObject({ status: "preparing", estimated_delivery_at: h.initial.estimated_delivery_at });
    expect(h.trackingWrites).toHaveLength(0);
    expect(h.enqueueNotification).not.toHaveBeenCalled();
    expect(h.transactions).toHaveLength(1);
  });

  it("propagates storage failures without reporting successful finalization", async () => {
    const h = harness({ updateError: "database unavailable" });
    await expect(h.run()).rejects.toThrow("database unavailable");
    expect(h.transactions).toHaveLength(0);
    expect(h.enqueueNotification).not.toHaveBeenCalled();
  });

  it("still rejects a different amount or currency before recording payment", async () => {
    const h = harness({ status: "completed", paymentStatus: "captured" });
    await expect(h.run({ session: { ...session, amount_total: 3100 } })).rejects.toThrow("ORDER_CHECKOUT_AMOUNT_MISMATCH");
    await expect(h.run({ session: { ...session, currency: "eur" } })).rejects.toThrow("ORDER_CHECKOUT_CURRENCY_MISMATCH");
    expect(h.transactions).toHaveLength(0);
  });
});
