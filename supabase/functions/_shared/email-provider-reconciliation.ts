// Provider acceptance, delivery to a recipient server, and reading are distinct.
// GET /emails/:id documents `last_event`; no webhook or new credential is needed.
// https://resend.com/docs/api-reference/emails/retrieve-email
// https://resend.com/docs/api-reference/api-keys/create-api-key
type Row = { id: string; provider_message_id: string; provider_status: string; provider_checked_at: string | null; sent_at: string };
const TERMINAL = "(delivered,bounced,complained,failed)";
const EVENTS = new Set(["sent", "delivered", "delivery_delayed", "bounced", "complained", "failed", "opened", "clicked", "scheduled", "canceled", "suppressed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 262_144) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Best-effort observation after sending. Never changes delivery queue status. */
export async function reconcileEmailProviderStatuses(input: {
  adminClient: any;
  apiKey: string | null | undefined;
  userId?: string | null;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  maxChecks?: number;
  budgetMs?: number;
}) {
  const result = { checked: 0, updated: 0, failed: 0, unsupported: false, disabled: !input.apiKey, selection_failed: false };
  if (!input.apiKey) return result;
  const clock = input.nowMs || Date.now;
  const started = clock();
  const budget = Math.max(1, Math.min(8_000, input.budgetMs || 8_000));
  const maxChecks = Math.max(1, Math.min(10, Math.floor(input.maxChecks || 10)));
  const remaining = () => Math.max(0, budget - (clock() - started));
  const signal = () => AbortSignal.timeout(Math.max(1, Math.min(2_000, remaining())));
  const cutoff = new Date(started - 72 * 60 * 60 * 1000).toISOString();
  const recheckBefore = new Date(started - 15 * 60 * 1000).toISOString();
  const tables = input.userId ? ["notification_deliveries"] : ["email_queue", "notification_deliveries"];
  const candidates: Array<{ table: string; row: Row }> = [];
  try {
    await Promise.all(tables.map(async (table) => {
      const fields = "id,provider_message_id,provider_status,provider_checked_at,sent_at";
      let query = input.adminClient.from(table)
        .select(fields + (input.userId ? ",notifications!inner(user_id)" : ""))
        .eq("status", "sent").not("provider_message_id", "is", null)
        .gte("sent_at", cutoff).lte("sent_at", new Date(started).toISOString())
        .not("provider_status", "in", TERMINAL)
        .or(`provider_checked_at.is.null,provider_checked_at.lt.${recheckBefore}`);
      if (table === "notification_deliveries") query = query.eq("channel", "email").eq("provider", "resend");
      if (input.userId) query = query.eq("notifications.user_id", input.userId);
      const { data, error } = await query.order("provider_checked_at", { nullsFirst: true })
        .order("sent_at").limit(maxChecks).abortSignal(signal());
      if (error) { result.selection_failed = true; return; }
      for (const row of data || []) candidates.push({ table, row });
    }));
  } catch { result.selection_failed = true; return result; }
  candidates.sort((a, b) => String(a.row.provider_checked_at || "").localeCompare(String(b.row.provider_checked_at || "")) || a.row.sent_at.localeCompare(b.row.sent_at));
  const request = input.fetchImpl || fetch;
  for (const { table, row } of candidates) {
    if (result.checked >= maxChecks || remaining() < 100) break;
    if (!UUID.test(row.provider_message_id)) { result.failed++; continue; }
    let providerStatus: string | null = null;
    let stop = false;
    result.checked++;
    try {
      const response = await request(`https://api.resend.com/emails/${encodeURIComponent(row.provider_message_id)}`, {
        method: "GET", headers: { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
        signal: signal(), redirect: "error",
      });
      if (response.status === 401 || response.status === 403) { result.unsupported = true; stop = true; }
      else if (response.status === 429) { result.failed++; stop = true; }
      else if (!response.ok) result.failed++;
      else {
        const data = await boundedJson(response);
        if (data?.id === row.provider_message_id && EVENTS.has(data.last_event)) providerStatus = data.last_event;
        else result.failed++;
      }
    } catch { result.failed++; }
    if (remaining() < 10) break;
    // Compare provider identity and previous observation to avoid a concurrent
    // stale worker overwriting terminal delivery evidence. `checked` is an
    // attempt timestamp; an unsuccessful poll never invents a provider status.
    try {
      let update = input.adminClient.from(table).update({
        provider_checked_at: new Date(clock()).toISOString(),
        ...(providerStatus ? { provider_status: providerStatus } : {}),
      }).eq("id", row.id).eq("provider_message_id", row.provider_message_id)
        .eq("status", "sent").not("provider_status", "in", TERMINAL);
      update = row.provider_checked_at === null ? update.is("provider_checked_at", null) : update.eq("provider_checked_at", row.provider_checked_at);
      const { data: updated, error } = await update.select("id").abortSignal(signal());
      if (error) result.failed++;
      else if (providerStatus && Array.isArray(updated) && updated.length) result.updated++;
    } catch { result.failed++; }
    if (stop) break;
  }
  return result;
}
