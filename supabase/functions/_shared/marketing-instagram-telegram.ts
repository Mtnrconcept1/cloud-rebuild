import { telegramReviewMessage, type InstagramReviewDraft, type InstagramReviewStatus, type InstagramReviewView } from "./marketing-instagram-review.ts";
import type { createAdminClient } from "./auth.ts";

export type ReviewRow = {
  id: string; fingerprint: string; payload: InstagramReviewDraft; requested_by: string;
  status: Exclude<InstagramReviewStatus, "expired">; token_hash: string; chat_id: string;
  message_id: number | null; expires_at: string; created_at: string;
  decided_at: string | null; decision_actor: string | null;
};
export interface ReviewStore {
  insert(row: Omit<ReviewRow, "id" | "created_at" | "decided_at">): Promise<ReviewRow | null>;
  findByFingerprint(fingerprint: string): Promise<ReviewRow | null>;
  list(): Promise<ReviewRow[]>;
  delivered(id: string, messageId: number): Promise<void>;
  unknown(id: string): Promise<void>;
  decide(hash: string, chatId: string, messageId: number, decision: "approved" | "rejected", actor: string, now: string): Promise<ReviewRow | null>;
}
export class InstagramReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function reviewView(row: ReviewRow): InstagramReviewView {
  return { id: row.id, status: ["delivering", "pending", "delivery_unknown"].includes(row.status) && row.expires_at <= new Date().toISOString() ? "expired" : row.status,
    payload: row.payload, createdAt: row.created_at, expiresAt: row.expires_at, decidedAt: row.decided_at };
}
type Send = (method: string, payload: ReturnType<typeof telegramReviewMessage> & { chat_id: string }) => Promise<unknown>;
export async function submitInstagramReview(store: ReviewStore, draft: InstagramReviewDraft, actor: string, chatId: string, send: Send): Promise<InstagramReviewView> {
  const fingerprint = await hash(JSON.stringify(draft));
  const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, "0")).join("");
  const expires_at = new Date(Date.now() + 24 * 3600_000).toISOString();
  const row = await store.insert({ fingerprint, payload: draft, requested_by: actor, status: "delivering", token_hash: await hash(token), chat_id: chatId, message_id: null, expires_at, decision_actor: null });
  if (!row) {
    const existing = await store.findByFingerprint(fingerprint);
    if (!existing) throw new InstagramReviewError(503, "review_store_unavailable");
    return reviewView(existing);
  }
  try {
    const result = await send("sendMessage", { chat_id: chatId, ...telegramReviewMessage(draft, token, expires_at) });
    const messageId = result && typeof result === "object" ? (result as Record<string, unknown>).message_id : null;
    if (typeof messageId !== "number" || !Number.isSafeInteger(messageId) || messageId <= 0) throw new Error("invalid_delivery_acknowledgement");
    await store.delivered(row.id, messageId);
  } catch {
    // Telegram has no idempotency key for sendMessage. Never re-send a draft
    // after a timeout or a crash between delivery and recording its receipt.
    await store.unknown(row.id);
  }
  const current = await store.findByFingerprint(fingerprint);
  if (!current) throw new InstagramReviewError(503, "review_store_unavailable");
  return reviewView(current);
}
export async function decideInstagramReview(store: ReviewStore, data: string, chatId: string, messageId: number, actor: string) {
  const match = /^igv:([ar]):([0-9a-f]{36})$/.exec(data);
  if (!match || !Number.isSafeInteger(messageId) || messageId <= 0) throw new InstagramReviewError(400, "invalid_review_decision");
  const row = await store.decide(await hash(match[2]), chatId, messageId, match[1] === "a" ? "approved" : "rejected", actor, new Date().toISOString());
  if (!row) throw new InstagramReviewError(409, "review_expired_or_decided");
  return reviewView(row);
}

/** Service-only storage, CAS decisions and globally unique immutable drafts. */
export function createInstagramReviewStore(client: ReturnType<typeof createAdminClient>): ReviewStore {
  const table = () => client.from("marketing_instagram_reviews");
  const checked = <T>(data: T, error: unknown): T => { if (error) throw new InstagramReviewError(503, "review_store_unavailable"); return data; };
  return {
    async insert(row) { const { data, error } = await table().insert(row).select("*").maybeSingle(); if (error?.code === "23505") return null; return checked(data, error) as ReviewRow | null; },
    async findByFingerprint(value) { const { data, error } = await table().select("*").eq("fingerprint", value).maybeSingle(); return checked(data, error) as ReviewRow | null; },
    async list() { const { data, error } = await table().select("*").order("created_at", { ascending: false }).limit(20); return checked(data || [], error) as ReviewRow[]; },
    async delivered(id, messageId) { const { error } = await table().update({ status: "pending", message_id: messageId }).eq("id", id).in("status", ["delivering", "delivery_unknown"]); checked(null, error); },
    async unknown(id) { const { error } = await table().update({ status: "delivery_unknown" }).eq("id", id).eq("status", "delivering"); checked(null, error); },
    async decide(token, chatId, messageId, status, actor, now) {
      const { data, error } = await table().update({ status, decided_at: now, decision_actor: actor, message_id: messageId })
        .eq("token_hash", token).eq("chat_id", chatId).or(`message_id.is.null,message_id.eq.${messageId}`)
        .in("status", ["delivering", "pending", "delivery_unknown"]).gt("expires_at", now).select("*").maybeSingle();
      return checked(data, error) as ReviewRow | null;
    },
  };
}
