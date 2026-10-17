import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Run the actual bridge functions; replace only external identity, DB and HTTP boundaries.
const source = readFileSync("supabase/functions/tok-connect-app-bridge/index.ts", "utf8")
  .replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const restaurantId = "12f4babe-9438-4fda-8892-20c26ea7f7bb";
const reservationId = "bdb9ef8a-5301-4529-bdba-1d8d2633f943";
const booking = {
  mode: "edge", capability: "reservations.classic.create", method: "POST",
  confirmed_by_user: true, idempotency_key: "booking-handler-attempt-1",
  payload: { restaurant_id: restaurantId, date: "2026-10-20", time: "19:00", party_size: 2, feature: "classique" },
};
const cancellation = {
  mode: "rpc", rpc_name: "cancel_reservation_by_customer",
  args: { p_reservation_id: reservationId }, confirmed_by_user: true,
  idempotency_key: "booking-handler-cancel-1",
};

function harness(options: {
  disabled?: boolean;
  businessRejected?: boolean;
  reservationOwner?: string;
  totalAmount?: number;
  feature?: string;
  cancellationRejected?: boolean;
  transportLost?: boolean;
  nativeResult?: Record<string, unknown> | null;
  guaranteeResult?: Record<string, unknown> | null;
  guaranteeResponse?: boolean;
} = {}) {
  const records = new Map<string, Record<string, unknown>>();
  const adminClient = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | null = null;
      const key = () => `${filters.user_id}:${filters.idempotency_key}`;
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters[field] = value; return query; },
        maybeSingle: async () => ({
          data: table === "restaurants"
            ? { id: restaurantId, is_active: true, status: "active", is_demo: false, tok_connect_mcp_enabled: !options.disabled }
            : records.get(key()) || null,
          error: null,
        }),
        insert: async (row: Record<string, unknown>) => {
          const id = `${row.user_id}:${row.idempotency_key}`;
          if (records.has(id)) return { error: { code: "23505" } };
          records.set(id, { ...row });
          return { error: null };
        },
        update: (row: Record<string, unknown>) => { update = row; return query; },
        then: (resolve: (value: unknown) => unknown) => {
          if (update) records.set(key(), { ...records.get(key()), ...update });
          return Promise.resolve(resolve({ error: null }));
        },
      };
      return query;
    },
  };
  const ownerFilters: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string) => ({
    data: name === "get_my_reservation_request_result" ? options.nativeResult || null
      : name === "get_my_reservation_guarantee_request_result" ? options.guaranteeResult || null
      : [{ ok: !options.cancellationRejected, error_code: options.cancellationRejected ? "too_late" : null }],
    error: null,
  }));
  const userClient = {
    from: () => {
      const filters: Record<string, unknown> = {};
      ownerFilters.push(filters);
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters[field] = value; return query; },
        maybeSingle: async () => ({
          data: filters.id === reservationId && filters.user_id === (options.reservationOwner || "customer-1")
            ? { id: reservationId, restaurant_id: restaurantId, date: "2026-10-20", time: "19:00", party_size: 2, status: "pending", feature: options.feature || "classique", total_amount: options.totalAmount || 0 }
            : null,
          error: null,
        }),
      };
      return query;
    },
    rpc,
  };
  const fetch = vi.fn(async () => {
    if (options.transportLost && fetch.mock.calls.length === 1) throw new Error("network_response_lost");
    return Response.json(options.businessRejected
    ? { ok: false, error_code: "no_capacity", error_message: "Complet" }
    : options.guaranteeResponse ? { ok: true, requires_card_guarantee: true, checkout_url: "https://checkout.stripe.com/c/pay/cs_test_fixture", fee_amount_cents: 7000 }
      : { ok: true, reservation_id: reservationId });
  });
  const dependencies = {
    HttpError, fetch,
    Deno: { env: { get: () => "https://tok.test" }, serve: () => {} },
    requireUserRole: (actor: { roles: string[] }, roles: string[]) => {
      if (!actor.roles.some((role) => roles.includes(role))) throw new HttpError(403, "forbidden");
    },
    sha256Base64Url: async (value: string) => createHash("sha256").update(value).digest("hex"),
    isClientCheckoutRestaurantEligible: (value: unknown) => Boolean(value),
    safeTokCommerceCheckoutUrl: (value: unknown) => typeof value === "string" && value.startsWith("https://checkout.stripe.com/") ? value : null,
  };
  const handlers = new Function(...Object.keys(dependencies), `${compiled};return { invokeEdge, invokeRpc };`)(...Object.values(dependencies));
  const actor = { userId: "customer-1", roles: ["client"], adminClient, userClient };
  const request = new Request("https://tok.test", { headers: { authorization: "Bearer customer-fixture" } });
  return {
    actor, records, fetch, rpc, ownerFilters,
    book: (body = booking, identity = actor) => handlers.invokeEdge(request, identity, body),
    cancel: (body = cancellation) => handlers.invokeRpc(actor, body),
  };
}

describe("TOK authenticated customer booking bridge", () => {
  it("accepts a client-only identity and forwards its JWT to the existing booking endpoint", async () => {
    const h = harness();
    expect(h.actor.roles).toEqual(["client"]);
    expect(await h.book()).toMatchObject({ statusCode: 200, payload: { ok: true, data: { reservation_id: reservationId } } });
    expect(h.fetch).toHaveBeenCalledOnce();
    const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://tok.test/functions/v1/create-reservation");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer customer-fixture");
    expect(JSON.parse(String(init.body))).toEqual(booking.payload);
  });

  it("rejects absent explicit consent and a non-client before calling the booking endpoint", async () => {
    const h = harness();
    await expect(h.book({ ...booking, confirmed_by_user: false })).rejects.toThrow("confirmation_required");
    await expect(h.book(booking, { ...h.actor, roles: ["restaurateur"] })).rejects.toThrow("forbidden");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.records.size).toBe(0);
  });

  it("replays the same booking key with a single downstream creation", async () => {
    const h = harness();
    await h.book();
    expect(await h.book()).toMatchObject({ statusCode: 200, payload: { replayed: true, data: { reservation_id: reservationId } } });
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("rejects a changed booking body reusing the same key", async () => {
    const h = harness();
    await h.book();
    await expect(h.book({ ...booking, payload: { ...booking.payload, time: "20:00" } })).rejects.toThrow("different_body");
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("treats an HTTP 200 business rejection as a safe failed booking, including replay", async () => {
    const h = harness({ businessRejected: true });
    expect(await h.book()).toMatchObject({ statusCode: 422, payload: { ok: false, retry_safe: true, data: { error_code: "no_capacity" } } });
    expect(await h.book()).toMatchObject({ statusCode: 422, payload: { ok: false, retry_safe: true, replayed: true } });
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("rejects an MCP-disabled restaurant before any downstream creation", async () => {
    const h = harness({ disabled: true });
    expect(await h.book()).toMatchObject({ statusCode: 409, payload: { ok: false, retry_safe: true } });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("recovers an exact native committed result after a lost response without creating again", async () => {
    const h = harness({ transportLost: true, nativeResult: { reservation_id: reservationId } });
    await expect(h.book()).rejects.toThrow("network_response_lost");
    const recovered = await h.book();
    expect(recovered.payload).toMatchObject({ ok: true, reconciled: true, replayed: true, data: { reservation_id: reservationId, status: "pending" } });
    expect(h.rpc).toHaveBeenCalledWith("get_my_reservation_request_result", { p_request_key: booking.idempotency_key });
    expect(h.fetch).toHaveBeenCalledOnce();
    await expect(h.book({ ...booking, payload: { ...booking.payload, time: "20:00" } })).rejects.toThrow("different_body");
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("keeps a pending or another owner's outcome locked and never starts another card setup", async () => {
    for (const options of [{ nativeResult: null }, { nativeResult: { reservation_id: reservationId }, reservationOwner: "customer-2" }]) {
      const h = harness({ transportLost: true, ...options });
      await expect(h.book()).rejects.toThrow("network_response_lost");
      await expect(h.book()).rejects.toThrow("request_in_progress");
      expect(h.fetch).toHaveBeenCalledOnce();
    }
  });

  it("recovers the exact existing guarantee checkout after a lost response", async () => {
    const h = harness({ transportLost: true, guaranteeResult: { status: "checkout_ready", checkout_url: "https://checkout.stripe.com/c/pay/cs_test_fixture", fee_amount_cents: 7000 } });
    await expect(h.book()).rejects.toThrow("network_response_lost");
    expect((await h.book()).payload).toMatchObject({ ok: true, reconciled: true, data: { requires_card_guarantee: true, fee_amount_cents: 7000 } });
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("resumes a proven durable setup binding using the same key, never a new attempt", async () => {
    const h = harness({ transportLost: true, guaranteeResult: { status: "pending" }, guaranteeResponse: true });
    await expect(h.book()).rejects.toThrow("network_response_lost");
    expect((await h.book()).payload).toMatchObject({ ok: true, data: { requires_card_guarantee: true } });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.fetch.mock.calls.map((call) => new Headers((call as unknown as [string, RequestInit])[1].headers).get("idempotency-key"))).toEqual([booking.idempotency_key, booking.idempotency_key]);
  });

  it("reads the actual reservation status after guarantee completion instead of treating bank setup as acceptance", async () => {
    const h = harness({ transportLost: true, guaranteeResult: { status: "confirmed", reservation_id: reservationId } });
    await expect(h.book()).rejects.toThrow("network_response_lost");
    expect((await h.book()).payload).toMatchObject({ data: { reservation_id: reservationId, status: "pending" } });
    expect(h.fetch).toHaveBeenCalledOnce();
  });
});

describe("TOK customer cancellation bridge", () => {
  it("filters by the authenticated owner and cancels an unpaid classic booking once", async () => {
    const h = harness();
    expect(await h.cancel()).toMatchObject({ statusCode: 200, payload: { ok: true } });
    expect(h.ownerFilters.length).toBeGreaterThanOrEqual(1);
    expect(h.ownerFilters.every((filter) => filter.id === reservationId && filter.user_id === h.actor.userId)).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith("cancel_reservation_by_customer", { p_reservation_id: reservationId });
    expect(await h.cancel()).toMatchObject({ payload: { replayed: true } });
    expect(h.rpc).toHaveBeenCalledOnce();
  });

  it("rejects another customer's booking before invoking the cancellation RPC", async () => {
    const h = harness({ reservationOwner: "customer-2" });
    await expect(h.cancel()).rejects.toThrow("reservation_not_found");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([{ totalAmount: 24 }, { feature: "zero-attente" }, { feature: "chefs_table" }])(
    "preserves specialized paid reservation workflows: %j", async (options) => {
      const h = harness(options);
      await expect(h.cancel()).rejects.toThrow("paid_reservation_requires_tok_support");
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );

  it("surfaces a cancellation business refusal as failure", async () => {
    const h = harness({ cancellationRejected: true });
    expect(await h.cancel()).toMatchObject({ statusCode: 409, payload: { ok: false, data: [{ error_code: "too_late" }] } });
  });
});
