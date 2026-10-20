import { describe, expect, it, vi } from "vitest";
import { parseInstagramReviewRequest, telegramReviewMessage } from "../../supabase/functions/_shared/marketing-instagram-review";
import { submitInstagramReview, decideInstagramReview, type ReviewRow, type ReviewStore } from "../../supabase/functions/_shared/marketing-instagram-telegram";

const input = { action: "instagram_review_submit", postUrl: "https://www.instagram.com/p/GENEVA/", username: "foodie", commentText: "Où manger ?", commentLikes: 23, replyText: "@foodie Découvrez https://thetok.ch/restaurants", observation: "manual" };
function fixture() {
  let row: ReviewRow | null = null;
  const store: ReviewStore = {
    insert: async (value) => { if (row) return null; row = { ...value, id: "review-1", created_at: new Date().toISOString(), decided_at: null }; return row; },
    findByFingerprint: async () => row,
    list: async () => row ? [row] : [],
    delivered: async (_id, messageId) => { if (row && ["delivering", "delivery_unknown"].includes(row.status)) { row.status = "pending"; row.message_id = messageId; } },
    unknown: async () => { if (row?.status === "delivering") row.status = "delivery_unknown"; },
    decide: async (hash, chatId, messageId, decision, actor, now) => {
      if (!row || row.token_hash !== hash || row.chat_id !== chatId || (row.message_id !== null && row.message_id !== messageId) || !["pending", "delivering", "delivery_unknown"].includes(row.status) || row.expires_at <= now) return null;
      row.status = decision; row.decided_at = now; row.decision_actor = actor; row.message_id = messageId; return row;
    },
  };
  return { store, row: () => row! };
}
describe("Instagram Telegram approval", () => {
  it("rejects caller-selected destinations, invalid URLs and mismatched mentions", () => {
    expect(() => parseInstagramReviewRequest({ ...input, chatId: "attacker" })).toThrow();
    for (const postUrl of ["https://evil.org/p/A/", "https://www.instagram.com.evil.org/p/A/", "https://www.instagram.com/accounts/login/"]) expect(() => parseInstagramReviewRequest({ ...input, postUrl })).toThrow();
    expect(() => parseInstagramReviewRequest({ ...input, replyText: "@foodie_fake hello" })).toThrow();
  });
  it("bounds Telegram text, retains the entire approved reply and never interprets user markup", () => {
    const draft = parseInstagramReviewRequest({ ...input, commentText: "<b>" + "x".repeat(2190), replyText: "@foodie " + "r".repeat(2190) });
    if (draft.action !== "instagram_review_submit") throw new Error();
    const message = telegramReviewMessage(draft, "abc123", "2026-10-21T12:00:00Z");
    expect(message.text.length).toBeLessThanOrEqual(4096);
    expect(message.text).toContain(draft.replyText);
    expect(message).not.toHaveProperty("parse_mode");
    expect(message.reply_markup.inline_keyboard[0][0].callback_data).toBe("igv:a:abc123");
  });
  it("sends one immutable pair on concurrent duplicate submissions and hides decision credentials", async () => {
    const { store } = fixture(); const send = vi.fn().mockResolvedValue({ message_id: 42 });
    const draft = parseInstagramReviewRequest(input); if (draft.action !== "instagram_review_submit") throw new Error();
    const results = await Promise.all([submitInstagramReview(store, draft, "admin", "123", send), submitInstagramReview(store, draft, "admin", "123", send)]);
    expect(send).toHaveBeenCalledTimes(1); expect(results[0].id).toBe(results[1].id);
    expect(JSON.stringify(results)).not.toMatch(/token_hash|chat_id|abc123/);
    expect(results[0].payload.replyText).toBe(input.replyText);
  });
  it("does not retry an ambiguous send, but permits the authorized delivered message to be decided once", async () => {
    const { store, row } = fixture(); let token = "";
    const send = vi.fn(async (_method, payload) => { token = payload.reply_markup.inline_keyboard[0][0].callback_data.split(":")[2]; throw new Error("network timeout"); });
    const draft = parseInstagramReviewRequest(input); if (draft.action !== "instagram_review_submit") throw new Error();
    expect((await submitInstagramReview(store, draft, "admin", "123", send)).status).toBe("delivery_unknown");
    await submitInstagramReview(store, draft, "admin", "123", send); expect(send).toHaveBeenCalledTimes(1);
    await expect(decideInstagramReview(store, `igv:a:${token}`, "wrong-chat", 42, "actor")).rejects.toThrow();
    expect((await decideInstagramReview(store, `igv:a:${token}`, "123", 42, "actor")).status).toBe("approved");
    await expect(decideInstagramReview(store, `igv:r:${token}`, "123", 42, "actor")).rejects.toThrow();
    expect(row().payload.replyText).toBe(input.replyText);
  });
  it("rejects expired tokens and callbacks for another message", async () => {
    const { store, row } = fixture(); let data = "";
    const draft = parseInstagramReviewRequest(input); if (draft.action !== "instagram_review_submit") throw new Error();
    await submitInstagramReview(store, draft, "admin", "123", async (_method, payload) => { data = payload.reply_markup.inline_keyboard[0][0].callback_data; return { message_id: 42 }; });
    await expect(decideInstagramReview(store, data, "123", 43, "actor")).rejects.toThrow();
    row().expires_at = "2020-01-01T00:00:00Z";
    await expect(decideInstagramReview(store, data, "123", 42, "actor")).rejects.toThrow();
  });
});
