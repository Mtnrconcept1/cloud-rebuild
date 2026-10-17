import { describe, expect, it, vi } from "vitest";
import { reconcileEmailProviderStatuses } from "../../supabase/functions/_shared/email-provider-reconciliation";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const providerId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
type Row = Record<string, any>;
function row(n: number, extra: Row = {}): Row {
  return { id: `row-${n}`, provider_message_id: providerId(n), provider_status: "unknown", provider_checked_at: null,
    status: "sent", sent_at: new Date(NOW - 3600000).toISOString(), channel: "email", provider: "resend", user_id: "caller", ...extra };
}
function database(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; mode: string; filters: unknown[]; fields: string; limit?: number; patch?: Row }> = [];
  const client = { from(table: string) {
    const record = { table, mode: "select", filters: [] as unknown[], fields: "", limit: 100, patch: undefined as Row | undefined };
    calls.push(record);
    const predicates: Array<(row: Row) => boolean> = [];
    const query = {
      select: (fields: string) => { record.fields = fields; return query; },
      update: (patch: Row) => { record.mode = "update"; record.patch = patch; return query; },
      eq: (key: string, value: unknown) => { record.filters.push(["eq", key, value]); predicates.push(row => row[key === "notifications.user_id" ? "user_id" : key] === value); return query; },
      is: (key: string, value: unknown) => { record.filters.push(["is", key, value]); predicates.push(row => row[key] === value); return query; },
      gte: (key: string, value: string) => { record.filters.push(["gte", key, value]); predicates.push(row => row[key] >= value); return query; },
      lte: (key: string, value: string) => { record.filters.push(["lte", key, value]); predicates.push(row => row[key] <= value); return query; },
      not: (key: string, operator: string, value: string | null) => {
        record.filters.push(["not", key, operator, value]);
        predicates.push(row => operator === "is" ? row[key] !== null : !String(value).slice(1, -1).split(",").includes(row[key])); return query;
      },
      or: (value: string) => { record.filters.push(["or", value]); const cutoff = value.split(".lt.")[1]; predicates.push(row => row.provider_checked_at === null || row.provider_checked_at < cutoff); return query; },
      order: () => query,
      limit: (limit: number) => { record.limit = limit; return query; },
      abortSignal: () => query,
      then: (resolve: (data: unknown) => unknown) => {
        const selected = (tables[table] || []).filter(row => predicates.every(predicate => predicate(row))).slice(0, record.limit);
        if (record.patch) for (const row of selected) Object.assign(row, record.patch);
        return Promise.resolve(resolve({ data: selected.map(row => ({ ...row })), error: null }));
      },
    };
    return query;
  } };
  return { client, calls };
}

describe("bounded Resend delivery observation", () => {
  it("stores verified provider status separately from queue acknowledgement", async () => {
    const mail = row(1), notification = row(2);
    const db = database({ email_queue: [mail], notification_deliveries: [notification] });
    const fetch = vi.fn(async (url: string | URL | Request) => Response.json({ id: String(url).split("/").pop(), last_event: "delivered", html: "private body" }));
    const result = await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", fetchImpl: fetch as typeof globalThis.fetch, nowMs: () => NOW });
    expect(result).toMatchObject({ checked: 2, updated: 2, failed: 0 });
    for (const item of [mail, notification]) {
      expect(item.status).toBe("sent"); expect(item.provider_status).toBe("delivered");
      expect(item.provider_checked_at).toBe(new Date(NOW).toISOString());
      expect(item.html).toBeUndefined();
    }
    expect(fetch.mock.calls.every(([url]) => String(url).startsWith("https://api.resend.com/emails/"))).toBe(true);
    for (const update of db.calls.filter(call => call.mode === "update")) {
      expect(update.filters).toContainEqual(["eq", "status", "sent"]);
      expect(update.filters).toContainEqual(["eq", "provider_message_id", providerId(update.table === "email_queue" ? 1 : 2)]);
      expect(update.filters).toContainEqual(["is", "provider_checked_at", null]);
    }
  });

  it("selects only recent sent emails without terminal or recent observations", async () => {
    const eligible = row(1);
    const excluded = [row(2, { provider_status: "delivered" }), row(3, { provider_status: "bounced" }), row(4, { provider_status: "complained" }), row(5, { provider_status: "failed" }),
      row(6, { sent_at: new Date(NOW - 73 * 3600000).toISOString() }), row(7, { status: "queued" }), row(8, { provider_message_id: null }), row(9, { provider_checked_at: new Date(NOW - 60000).toISOString() }), row(10, { channel: "push" })];
    const db = database({ notification_deliveries: [eligible, ...excluded], email_queue: [] });
    const fetch = vi.fn(async () => Response.json({ id: providerId(1), last_event: "bounced" }));
    const result = await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", fetchImpl: fetch, nowMs: () => NOW });
    expect(result.checked).toBe(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect(eligible.provider_status).toBe("bounced"); expect(eligible.status).toBe("sent");
    expect(excluded[5].status).toBe("queued");
  });

  it("respects a user-scoped dispatch and hard-caps provider requests", async () => {
    const own = Array.from({ length: 25 }, (_, index) => row(index + 1));
    const other = row(30, { user_id: "other" });
    const db = database({ notification_deliveries: [...own, other], email_queue: [row(40)] });
    const fetch = vi.fn(async (url: string | URL | Request) => Response.json({ id: String(url).split("/").pop(), last_event: "sent" }));
    const result = await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", userId: "caller", fetchImpl: fetch as typeof globalThis.fetch, nowMs: () => NOW, maxChecks: 100 });
    expect(result.checked).toBe(10); expect(fetch).toHaveBeenCalledTimes(10);
    expect(db.calls.some(call => call.table === "email_queue")).toBe(false);
    expect(db.calls[0].fields).toContain("notifications!inner(user_id)");
    expect(db.calls[0].filters).toContainEqual(["eq", "notifications.user_id", "caller"]);
    expect(other.provider_checked_at).toBeNull();
    expect(own[0].provider_status).toBe("sent");
  });

  it("leaves sending operational with a send-only key or provider failure", async () => {
    for (const status of [401, 403, 429, 503]) {
      const mail = row(1); const db = database({ email_queue: [mail, row(2)], notification_deliveries: [] });
      const fetch = vi.fn(async () => new Response("private provider error", { status }));
      const result = await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", fetchImpl: fetch, nowMs: () => NOW });
      expect(mail.status).toBe("sent"); expect(mail.provider_status).toBe("unknown");
      expect(result.updated).toBe(0);
      if (status !== 503) expect(fetch).toHaveBeenCalledTimes(1);
      if (status === 401 || status === 403) expect(result.unsupported).toBe(true);
    }
  });

  it("never substitutes acceptance or an unverified/mismatched event for delivery", async () => {
    for (const payload of [{ id: providerId(1), last_event: "sent" }, { id: providerId(1), last_event: "opened" }, { id: providerId(99), last_event: "delivered" }, { id: providerId(1), last_event: "made_up" }]) {
      const mail = row(1), db = database({ email_queue: [mail], notification_deliveries: [] });
      await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", fetchImpl: async () => Response.json(payload), nowMs: () => NOW });
      expect(mail.provider_status).not.toBe("delivered"); expect(mail.status).toBe("sent");
    }
  });

  it("does not overwrite a concurrent terminal observation", async () => {
    const mail = row(1), db = database({ email_queue: [mail], notification_deliveries: [] });
    const result = await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", nowMs: () => NOW,
      fetchImpl: async () => { mail.provider_status = "delivered"; return Response.json({ id: providerId(1), last_event: "sent" }); } });
    expect(result.updated).toBe(0); expect(mail.provider_status).toBe("delivered");
  });

  it("bounds provider bodies and tolerates malformed responses or timeouts", async () => {
    for (const fetchImpl of [
      async () => new Response("x".repeat(262145)),
      async () => new Response("not JSON"),
      async () => { throw new DOMException("Request timed out", "TimeoutError"); },
    ]) {
      const mail = row(1), db = database({ email_queue: [mail], notification_deliveries: [] });
      const result = await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", fetchImpl, nowMs: () => NOW });
      expect(result).toMatchObject({ checked: 1, updated: 0, failed: 1 });
      expect(mail.status).toBe("sent"); expect(mail.provider_status).toBe("unknown");
    }
  });

  it("stops at the elapsed time budget and skips all polling without a key", async () => {
    let now = NOW;
    const mail = row(1), db = database({ email_queue: [mail, row(2)], notification_deliveries: [] });
    const fetch = vi.fn(async () => { now += 1100; return Response.json({ id: providerId(1), last_event: "delivered" }); });
    const result = await reconcileEmailProviderStatuses({ adminClient: db.client, apiKey: "test-only-key", fetchImpl: fetch, nowMs: () => now, budgetMs: 1000 });
    expect(result.checked).toBe(1); expect(result.updated).toBe(0); expect(fetch).toHaveBeenCalledTimes(1);
    const from = vi.fn();
    expect(await reconcileEmailProviderStatuses({ adminClient: { from }, apiKey: null })).toMatchObject({ disabled: true, checked: 0 });
    expect(from).not.toHaveBeenCalled();
  });
});
