import {
  buildMarketingContentReviewDocument, marketingContentReviewControlMessage, MarketingContentReviewDocumentError,
  type MarketingContentReviewSnapshot, type MarketingContentReviewStatus, type MarketingContentReviewTargetType,
  type MarketingContentReviewView,
} from "./marketing-content-review.ts";

export type MarketingContentReviewRow = {
  id: string; target_type: MarketingContentReviewTargetType; target_id: string; revision: number;
  snapshot: MarketingContentReviewSnapshot; status: MarketingContentReviewStatus; created_at: string; expires_at: string;
  document_complete: boolean; message_ids: number[]; control_message_id: number | null;
  decided_at: string | null; decision_actor: string | null; last_error_code?: string | null;
};
export type MarketingContentReviewDelivery = {
  messageIds?: number[]; controlMessageId?: number; documentComplete?: boolean;
  outcome: "delivered" | "failed" | "delivery_unknown"; errorCode?: string;
};
export interface MarketingContentReviewStore {
  claim(tokenHash: string, chatId: string): Promise<MarketingContentReviewRow | null>;
  recordDelivery(id: string, delivery: MarketingContentReviewDelivery): Promise<MarketingContentReviewRow>;
  decide(tokenHash: string, chatId: string, messageId: number, decision: "approved" | "rejected", actor: string): Promise<MarketingContentReviewRow | null>;
}
export class MarketingContentReviewError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "MarketingContentReviewError"; }
}
/** Only an explicit provider rejection proves that a request was not delivered. */
export class MarketingContentReviewDeliveryError extends Error {
  constructor(message: string, public certainlyNotSent = false) { super(message); this.name = "MarketingContentReviewDeliveryError"; }
}
export type MarketingContentReviewSend = (method: string, payload: Record<string, unknown>) => Promise<unknown>;
export type MarketingContentReviewProcessOptions = {
  supabaseUrl: string; now?: () => number; sleep?: (milliseconds: number) => Promise<void>;
  budgetMs?: number; sendTimeoutMs?: number;
};
export type MarketingContentReviewProcessResult = {
  status: "idle" | MarketingContentReviewStatus; review?: MarketingContentReviewView; errorCode?: string;
};

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  byte => byte.toString(16).padStart(2, "0")).join("");
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function marketingContentReviewView(row: MarketingContentReviewRow, now = Date.now()): MarketingContentReviewView {
  const expired = ["delivering", "pending", "delivery_unknown"].includes(row.status) && Date.parse(row.expires_at) <= now;
  return { id: row.id, target_type: row.target_type, target_id: row.target_id, revision: row.revision,
    status: expired ? "expired" : row.status, created_at: row.created_at, expires_at: row.expires_at, decided_at: row.decided_at,
    delivery_complete: row.document_complete,
    message_count: new Set([...row.message_ids, ...(row.control_message_id ? [row.control_message_id] : [])]).size,
    last_error_code: /^content_review_[a-z_]{1,70}$/.test(row.last_error_code ?? "") ? row.last_error_code : null };
}
function certainlyRejected(error: unknown): boolean {
  return error instanceof MarketingContentReviewDeliveryError ? error.certainlyNotSent
    : isRecord(error) && isRecord(error.details) && error.details.telegramRejected === true;
}
function messageId(result: unknown, chatId: string): number {
  if (!isRecord(result) || !positiveId(result.message_id)
    || (isRecord(result.chat) && String(result.chat.id) !== chatId)) {
    throw new MarketingContentReviewDeliveryError("content_review_invalid_acknowledgement");
  }
  return result.message_id;
}

/** One claimed target per invocation. Uncertain delivery is never claimed again. */
export async function processMarketingContentReview(
  store: MarketingContentReviewStore, chatId: string, send: MarketingContentReviewSend,
  options: MarketingContentReviewProcessOptions = { supabaseUrl: "" },
): Promise<MarketingContentReviewProcessResult> {
  if (!/^-?[1-9][0-9]{0,19}$/.test(chatId)) throw new MarketingContentReviewError(503, "content_review_destination_unavailable");
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const budgetMs = options.budgetMs ?? 140_000;
  const sendTimeoutMs = options.sendTimeoutMs ?? 15_000;
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 140_000
    || !Number.isFinite(sendTimeoutMs) || sendTimeoutMs <= 0 || sendTimeoutMs > budgetMs) {
    throw new MarketingContentReviewError(500, "content_review_budget_invalid");
  }
  const startedAt = now();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, "0")).join("");
  const claimed = await store.claim(await hash(token), chatId);
  if (!claimed) return { status: "idle" };
  let row = claimed;
  const result = (errorCode?: string): MarketingContentReviewProcessResult => ({ status: row!.status,
    review: marketingContentReviewView(row!, now()), ...(errorCode ? { errorCode } : {}) });
  const fail = async (outcome: "failed" | "delivery_unknown", errorCode: string) => {
    row = await store.recordDelivery(row!.id, { outcome, errorCode });
    return result(errorCode);
  };
  if (row.status !== "delivering") return result();

  let document: ReturnType<typeof buildMarketingContentReviewDocument>;
  let control: ReturnType<typeof marketingContentReviewControlMessage>;
  const intervalMs = chatId.startsWith("-") ? 3100 : 1100;
  try {
    if (row.snapshot.targetType !== row.target_type || row.snapshot.targetId !== row.target_id || row.snapshot.revision !== row.revision
      || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= now()
      || Date.parse(row.expires_at) > now() + 24 * 3600_000 + 5000
      || row.document_complete || row.message_ids.length || row.control_message_id !== null) {
      throw new MarketingContentReviewDocumentError("content_review_snapshot_invalid");
    }
    document = buildMarketingContentReviewDocument(row.snapshot, { supabaseUrl: options.supabaseUrl });
    control = marketingContentReviewControlMessage(row.snapshot, token, row.expires_at);
    // Account for the final decision message as well as the mandatory pacing.
    if (document.messages.length * intervalMs + sendTimeoutMs > budgetMs) {
      throw new MarketingContentReviewDocumentError("content_review_document_too_large");
    }
  } catch (error) {
    if (!(error instanceof MarketingContentReviewDocumentError)) throw error;
    return fail("failed", error.code);
  }

  let nextSendAt = startedAt;
  const reserveNextRequest = async () => {
    const delay = Math.max(0, nextSendAt - now());
    if (now() + delay + sendTimeoutMs > startedAt + budgetMs) {
      throw new MarketingContentReviewDeliveryError("content_review_budget_exhausted", true);
    }
    if (delay) await sleep(delay);
    if (now() + sendTimeoutMs > startedAt + budgetMs) {
      throw new MarketingContentReviewDeliveryError("content_review_budget_exhausted", true);
    }
    nextSendAt = now() + intervalMs;
  };
  const transmit = async (method: string, payload: Record<string, unknown>, final = false) => {
    let providerAcknowledged = false;
    try {
      await reserveNextRequest();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let acknowledgement: unknown;
      try {
        // Bound the complete provider promise, including response body parsing.
        // A late response cannot resume this invocation or turn into a retry.
        acknowledgement = await Promise.race([
          send(method, { ...payload, chat_id: chatId }),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new MarketingContentReviewDeliveryError("content_review_delivery_unknown")), sendTimeoutMs);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      const sentId = messageId(acknowledgement, chatId);
      providerAcknowledged = true;
      if (row.message_ids.includes(sentId) || row.control_message_id === sentId) {
        throw new MarketingContentReviewDeliveryError("content_review_invalid_acknowledgement");
      }
      row = await store.recordDelivery(row!.id, { outcome: "delivered",
        ...(final ? { controlMessageId: sentId } : { messageIds: [sentId] }) });
      if (final ? row.control_message_id !== sentId : !row.message_ids.includes(sentId)) {
        throw new MarketingContentReviewDeliveryError("content_review_invalid_acknowledgement");
      }
      return null;
    } catch (error) {
      if (error instanceof MarketingContentReviewError && error.status === 409) throw error;
      // A database write failure after a successful provider reply is ambiguous.
      const certain = !providerAcknowledged && certainlyRejected(error);
      const code = error instanceof MarketingContentReviewDeliveryError && error.message === "content_review_budget_exhausted"
        ? error.message : certain ? "content_review_telegram_rejected" : "content_review_delivery_unknown";
      return fail(certain ? "failed" : "delivery_unknown", code);
    }
  };

  for (const message of document.messages) {
    const failure = await transmit(message.method, message.payload);
    if (failure) return failure;
    if (row.status !== "delivering") return result();
  }
  // Persist completeness BEFORE making the decision token available to Telegram.
  try {
    if (new Set(row.message_ids).size !== document.messages.length) throw new MarketingContentReviewError(503, "content_review_store_unavailable");
    row = await store.recordDelivery(row.id, { outcome: "delivered", documentComplete: true });
    if (!row.document_complete) throw new MarketingContentReviewError(503, "content_review_store_unavailable");
  } catch (error) {
    if (error instanceof MarketingContentReviewError && error.status === 409) throw error;
    return fail("delivery_unknown", "content_review_delivery_unknown");
  }
  if (row.status !== "delivering") return result();
  const failure = await transmit("sendMessage", control, true);
  return failure ?? result();
}

export async function decideMarketingContentReview(
  store: MarketingContentReviewStore, data: string, chatId: string, messageId: number, actor: string,
): Promise<MarketingContentReviewView> {
  const match = /^mcv:([ar]):([0-9a-f]{36})$/.exec(data);
  if (!match || !positiveId(messageId) || !/^-?[1-9][0-9]{0,19}$/.test(chatId)
    || !/^telegram:[1-9][0-9]{0,19}(?::[A-Za-z0-9_]{1,80})?$/.test(actor)) {
    throw new MarketingContentReviewError(400, "invalid_content_review_decision");
  }
  const decision = match[1] === "a" ? "approved" : "rejected";
  const row = await store.decide(await hash(match[2]), chatId, messageId, decision, actor);
  if (!row || row.status !== decision) throw new MarketingContentReviewError(409, "content_review_expired_stale_or_decided");
  return marketingContentReviewView(row);
}

type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
/** All mutations remain inside the service-only, revision-checked SQL functions. */
export function createMarketingContentReviewStore(client: RpcClient): MarketingContentReviewStore {
  const rpc = async (name: string, args: Record<string, unknown>, nullable = false): Promise<MarketingContentReviewRow | null> => {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const conflict = isRecord(error) && ["40001", "P0002"].includes(String(error.code));
      throw new MarketingContentReviewError(conflict ? 409 : 503, conflict ? "content_review_expired_stale_or_decided" : "content_review_store_unavailable");
    }
    if (data === null && nullable) return null;
    if (data === null) throw new MarketingContentReviewError(409, "content_review_expired_stale_or_decided");
    if (!isRecord(data) || typeof data.id !== "string" || !isRecord(data.snapshot) || !Array.isArray(data.message_ids)) {
      throw new MarketingContentReviewError(503, "content_review_store_unavailable");
    }
    return data as MarketingContentReviewRow;
  };
  return {
    claim: (tokenHash, chatId) => rpc("claim_marketing_content_review", { p_token_hash: tokenHash, p_chat_id: chatId }, true),
    recordDelivery: async (id, delivery) => (await rpc("record_marketing_content_review_delivery", {
      p_review_id: id, p_message_ids: delivery.messageIds ?? [], p_control_message_id: delivery.controlMessageId ?? null,
      p_document_complete: delivery.documentComplete ?? false, p_outcome: delivery.outcome,
      p_error_code: delivery.errorCode ?? null,
    }))!,
    decide: (tokenHash, chatId, messageId, decision, actor) => rpc("decide_marketing_content_review", {
      p_token_hash: tokenHash, p_chat_id: chatId, p_message_id: messageId, p_decision: decision, p_actor: actor,
    }, true),
  };
}
