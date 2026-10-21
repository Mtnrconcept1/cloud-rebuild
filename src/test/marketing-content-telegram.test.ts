import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMetaCaption, composeMetaCaption } from "../../supabase/functions/_shared/meta-publishing";
import { parseMarketingContentReviewRequest } from "../../supabase/functions/_shared/marketing-content-review-request";
import {
  buildMarketingContentReviewDocument, marketingContentReviewMediaUrl,
  splitMarketingReviewText, type MarketingContentReviewSnapshot,
} from "../../supabase/functions/_shared/marketing-content-review";
import {
  createMarketingContentReviewStore, decideMarketingContentReview, MarketingContentReviewDeliveryError,
  processMarketingContentReview, type MarketingContentReviewRow, type MarketingContentReviewStore,
} from "../../supabase/functions/_shared/marketing-content-telegram";

const NOW = Date.UTC(2026, 9, 21, 12);
const ORIGIN = "https://project.supabase.co";
const id = (number: number) => `11111111-1111-4111-8111-${String(number).padStart(12, "0")}`;
const visualUrl = (number: number) => `${ORIGIN}/storage/v1/object/public/social-post-media/marketing-ai/geneve/image-${number}.jpg`;
const actor = "telegram:456:admin";
function snapshot(count = 2, targetType: "campaign" | "item" = "campaign"): MarketingContentReviewSnapshot {
  return { schemaVersion: 1, targetType, targetId: id(targetType === "campaign" ? 100 : 1), revision: 3,
    campaign: targetType === "campaign" ? { id: id(100), name: "Restaurants de Genève", objective: "Faire découvrir TOK",
      channels: ["instagram"], audience_name: "Restaurants genevois", audience_definition: { audience_kind: "restaurant", city: "Genève", canton: "GE" },
      starts_at: "2026-10-22T14:00:00.000Z", ends_at: "2026-10-25T15:00:00.000Z", content: { message: "Rencontrons les restaurateurs genevois." } } : null,
    items: Array.from({ length: count }, (_, index) => ({ id: id(index + 1), title: `Publication ${index + 1}`, channel: "instagram",
      scheduled_at: "2026-10-22T14:00:00.000Z", timezone: "Europe/Zurich", targeting: { audience_kind: "restaurant", city: "Genève", canton: "GE" },
      integration: { id: id(200), account_username: "tok_geneve", account_id: "123456" },
      content: { headline: `Genève ${index + 1}`, body: "Découvrez les belles tables 🍽️ de Genève. #Genève", call_to_action: "Découvrez TOK",
        hashtags: ["Genève", "Restaurants"], visual_url: visualUrl(index + 1), visual_status: "ready", visual_required: true, visual_format: "4:5" },
    })),
  };
}
function fixture(draft = snapshot(), chatId = "123") {
  let clock = NOW;
  let claimed = false;
  let tokenHash = "";
  let message = 40;
  const events: string[] = [];
  const row: MarketingContentReviewRow = { id: id(300), target_type: draft.targetType, target_id: draft.targetId, revision: draft.revision,
    snapshot: draft, status: "delivering", created_at: new Date(NOW).toISOString(), expires_at: new Date(NOW + 24 * 3600_000).toISOString(),
    document_complete: false, message_ids: [], control_message_id: null, decided_at: null, decision_actor: null };
  const store: MarketingContentReviewStore = {
    claim: vi.fn(async (hash, requestedChatId) => {
      if (claimed) return null;
      expect(requestedChatId).toBe(chatId);
      tokenHash = hash; claimed = true; return row;
    }),
    recordDelivery: vi.fn(async (_id, delivery) => {
      events.push(delivery.documentComplete ? "complete" : delivery.controlMessageId ? "control-ack" : `record:${delivery.outcome}`);
      if (delivery.outcome !== "delivered") { row.status = delivery.outcome; row.last_error_code = delivery.errorCode ?? null; return row; }
      row.message_ids = [...new Set([...row.message_ids, ...(delivery.messageIds ?? [])])];
      if (delivery.documentComplete) row.document_complete = true;
      if (delivery.controlMessageId) { row.control_message_id = delivery.controlMessageId; row.status = "pending"; }
      return row;
    }),
    decide: vi.fn(async (hash, requestedChatId, messageId, decision, decisionActor) => {
      if (hash !== tokenHash || requestedChatId !== chatId || !row.document_complete
        || (row.control_message_id !== null && row.control_message_id !== messageId)
        || !["delivering", "pending", "delivery_unknown"].includes(row.status) || Date.parse(row.expires_at) <= Date.now()) return null;
      row.status = decision; row.decided_at = new Date().toISOString(); row.decision_actor = decisionActor;
      row.control_message_id = messageId; return row;
    }),
  };
  const send = vi.fn(async (method: string, payload: Record<string, unknown>) => {
    events.push(payload.reply_markup ? "control" : method === "sendPhoto" ? "photo" : "text");
    return { message_id: ++message, chat: { id: Number(chatId) } };
  });
  const sleep = vi.fn(async (milliseconds: number) => { clock += milliseconds; });
  const options = { supabaseUrl: ORIGIN, now: () => clock, sleep };
  return { row, store, send, options, events, tokenHash: () => tokenHash, advance: (milliseconds: number) => { clock += milliseconds; } };
}
function decisionData(send: ReturnType<typeof fixture>["send"]): string {
  const payload = send.mock.calls.find(([, value]) => value.reply_markup)?.[1];
  return (payload?.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> }).inline_keyboard[0][0].callback_data;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Marketing content review contract and document", () => {
  it("accepts only target identifiers and optimistic retry expectations", () => {
    const status = { action: "content_review_status", targetType: "campaign", targetId: id(100) };
    expect(parseMarketingContentReviewRequest(status)).toEqual(status);
    const retry = { ...status, action: "content_review_retry", expectedRevision: 3, expectedReviewId: id(300) };
    expect(parseMarketingContentReviewRequest(retry)).toEqual(retry);
    expect(parseMarketingContentReviewRequest({ ...retry, expectedReviewId: null })).toHaveProperty("expectedReviewId", null);
    for (const invalid of [{ ...status, chatId: "999" }, { ...status, content: "replacement" }, { ...status, token: "secret" },
      { ...retry, expectedRevision: 0 }, { ...retry, expectedReviewId: undefined }, { ...status, targetId: "../campaign" },
      { ...status, action: "content_review_retry" }]) expect(() => parseMarketingContentReviewRequest(invalid)).toThrow();
  });

  it("accepts only server-created public images in both trusted marketing prefixes", () => {
    expect(marketingContentReviewMediaUrl(visualUrl(1), ORIGIN)).toBe(visualUrl(1));
    const mailing = `${ORIGIN}/storage/v1/object/public/social-post-media/marketing-mailing/${id(400)}/${id(1)}/${id(500)}.png`;
    expect(marketingContentReviewMediaUrl(mailing, ORIGIN)).toBe(mailing);
    for (const url of [visualUrl(1).replace("https:", "http:"), visualUrl(1).replace("project.supabase.co", "attacker.example"),
      visualUrl(1).replace("https://", "https://user:password@"), `${visualUrl(1)}?token=private`, `${visualUrl(1)}#hidden`,
      visualUrl(1).replace("/public/", "/sign/"), visualUrl(1).replace("social-post-media", "private-mails"),
      visualUrl(1).replace("marketing-ai", id(400)), visualUrl(1).replace("marketing-ai", "marketing-ai-other"),
      visualUrl(1).replace("image-1.jpg", "%2Fprivate.jpg"), "https://127.0.0.1/image.jpg", "data:image/png;base64,AAAA"]) {
      expect(() => marketingContentReviewMediaUrl(url, ORIGIN)).toThrow();
    }
  });

  it("keeps the real caption and emoji intact while splitting long text into legal Telegram messages", () => {
    const draft = snapshot(1, "item");
    draft.items[0].channel = "facebook";
    draft.items[0].content.body = `🍽️ ${"Une table à Genève 💛 ".repeat(500)}`;
    const exact = composeMetaCaption(draft.items[0].content);
    const plan = buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN });
    const chunks = plan.messages.filter(item => item.kind === "text").map(item => String(item.payload.text));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toContain(exact);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
      expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk)).toBe(false);
    }
    const boundary = `${"a".repeat(4095)}💛fin`;
    expect(splitMarketingReviewText(boundary).join("")).toBe(boundary);
    expect(plan.messages[0].payload.caption).toEqual(expect.any(String));
    expect(String(plan.messages[0].payload.caption).length).toBeLessThanOrEqual(1024);
    expect(JSON.stringify(plan)).not.toContain("parse_mode");
    expect(JSON.stringify(plan)).not.toContain("callback_data");
  });

  it("presents readable Swiss dates and targeting without leaking non-editorial campaign metadata", () => {
    const draft = snapshot();
    draft.campaign!.content = { message: "Texte de campagne à relire", prompt: "hidden internal prompt", recipientEmails: ["private@example.org"] };
    draft.campaign!.audience_definition = { city: "Genève", canton: "GE", recipientEmails: ["private@example.org"] };
    const transcript = buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN }).messages.map(message => String(message.payload.text ?? "")).join("");
    expect(transcript).toContain("Texte de campagne à relire");
    expect(transcript).toContain("Ville : Genève · Canton : GE");
    expect(transcript).toContain("16:00");
    expect(transcript).not.toMatch(/private@example|hidden internal|14:00:00.000Z|recipientEmails/);
  });

  it("shows canonical plural targeting facets and recipient counts without exposing identities", () => {
    const draft = snapshot(1, "item");
    draft.items[0].targeting = { audience_kind: "restaurant", city: "Genève", cities: ["Genève", "Carouge"],
      cantons: ["GE", "VD"], countries: ["CH"], languages: ["fr", "en"], segments: ["Prospects"],
      restaurant_categories: ["Brasserie"], contact_types: ["Professionnel"], subscribed_only: true,
      selected_recipient_count: 42, recipient_emails: ["private@example.org"], contact_ids: [id(700)], merchant_type: "not-a-snapshot-field" };
    const transcript = buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN }).messages.map(message => String(message.payload.text ?? "")).join("");
    for (const expected of ["Villes : Genève, Carouge", "Cantons : GE, VD", "Pays : CH", "Langues : fr, en", "Segment : Prospects",
      "Catégorie de restaurant : Brasserie", "Type de contact : Professionnel", "Abonnés uniquement : oui", "Destinataires sélectionnés : 42"]) {
      expect(transcript).toContain(expected);
    }
    expect(transcript).not.toMatch(/private@example|not-a-snapshot-field|recipient_emails|contact_ids/);
    expect(transcript).not.toContain(id(700));
  });

  it.each(["message", "caption"])("shows the exact manual Meta %s without claiming the draft is publishable", (key) => {
    const draft = snapshot(1, "item");
    draft.items[0].content = { [key]: "Une table à Genève 🍽️\nUn texte manuel exact.", visual_url: visualUrl(1), visual_status: "ready" };
    const transcript = buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN }).messages.map(message => String(message.payload.text ?? "")).join("");
    expect(transcript).toContain(`TEXTE EXACT\n${draft.items[0].content[key]}`);
    expect(transcript).toContain("le contenu Meta doit être complété dans TOK avant diffusion");
    expect(() => buildMetaCaption(draft.items[0].content, "instagram")).toThrow("meta_content_empty");
  });

  it("keeps composed Meta copy authoritative and the manual channel preview order", () => {
    const draft = snapshot(1, "item");
    draft.items[0].content.message = "Texte du canal manuel";
    const metaTranscript = buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN }).messages.map(message => String(message.payload.text ?? "")).join("");
    expect(metaTranscript).toContain(composeMetaCaption(draft.items[0].content));
    expect(metaTranscript).not.toContain("Texte du canal manuel");
    draft.items[0].channel = "telegram";
    const manualTranscript = buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN }).messages.map(message => String(message.payload.text ?? "")).join("");
    expect(manualTranscript).toContain("TEXTE EXACT\nTexte du canal manuel");
  });

  it("fails the entire plan before delivery when any required image or text is missing", () => {
    const draft = snapshot();
    draft.items[1].content.visual_url = null;
    expect(() => buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN })).toThrow("content_review_visual_missing");
    draft.items[1].content.visual_url = visualUrl(2);
    draft.items[0].content = { visual_url: visualUrl(1), visual_status: "ready" };
    expect(() => buildMarketingContentReviewDocument(draft, { supabaseUrl: ORIGIN })).toThrow("content_review_text_missing");
  });
});

describe("Marketing content Telegram delivery", () => {
  it("rejects restaurant-writable media before sending any part of the dossier", async () => {
    const draft = snapshot();
    draft.items[1].content.visual_url = visualUrl(2).replace("marketing-ai", id(400));
    const app = fixture(draft);
    expect(await processMarketingContentReview(app.store, "123", app.send, app.options)).toMatchObject({
      status: "failed", errorCode: "content_review_visual_invalid",
    });
    expect(app.send).not.toHaveBeenCalled();
    expect(app.row.document_complete).toBe(false);
  });

  it("sends all visuals, then complete texts, then buttons only after completeness is persisted", async () => {
    const app = fixture();
    const outcome = await processMarketingContentReview(app.store, "123", app.send, app.options);
    expect(outcome.status).toBe("pending");
    expect(app.send.mock.calls.slice(0, 2).map(([method]) => method)).toEqual(["sendPhoto", "sendPhoto"]);
    expect(app.events.indexOf("complete")).toBeGreaterThan(app.events.lastIndexOf("text"));
    expect(app.events.indexOf("control")).toBeGreaterThan(app.events.indexOf("complete"));
    expect(app.send.mock.calls.filter(([, payload]) => payload.reply_markup)).toHaveLength(1);
    expect(app.send.mock.calls.at(-1)?.[1].text).toContain("Restaurants de Genève");
    expect(app.send.mock.calls.at(-1)?.[1].text).toContain("La diffusion suit la programmation confirmée dans TOK");
    expect(outcome.review).toMatchObject({ delivery_complete: true, message_count: app.send.mock.calls.length });
    expect(app.row.message_ids).toHaveLength(app.send.mock.calls.length - 1);
    expect(app.tokenHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(outcome)).not.toMatch(/token_hash|chat_id|snapshot|message_ids|decision_actor/);
    expect(app.options.sleep.mock.calls.every(([delay]) => delay === 1100)).toBe(true);
  });

  it("does not resend a completed or uncertain review on another worker invocation", async () => {
    for (const uncertain of [false, true]) {
      const app = fixture();
      if (uncertain) app.send.mockRejectedValueOnce(new Error("timeout"));
      await processMarketingContentReview(app.store, "123", app.send, app.options);
      const sent = app.send.mock.calls.length;
      expect(await processMarketingContentReview(app.store, "123", app.send, app.options)).toEqual({ status: "idle" });
      expect(app.send).toHaveBeenCalledTimes(sent);
    }
  });

  it.each(["class", "provider"])("distinguishes a certainly rejected request (%s) from uncertain transport", async kind => {
    const app = fixture();
    app.send.mockRejectedValueOnce(kind === "class" ? new MarketingContentReviewDeliveryError("rate limit", true)
      : Object.assign(new Error("rejected"), { details: { telegramRejected: true } }));
    const result = await processMarketingContentReview(app.store, "123", app.send, app.options);
    expect(result).toMatchObject({ status: "failed", errorCode: "content_review_telegram_rejected" });
    expect(app.row.document_complete).toBe(false);
    expect(app.send).toHaveBeenCalledTimes(1);
  });

  it("marks a generic 502 or timeout as unknown and never sends decision buttons for partial documents", async () => {
    const app = fixture();
    app.send.mockResolvedValueOnce({ message_id: 41, chat: { id: 123 } });
    app.send.mockRejectedValueOnce(Object.assign(new Error("upstream failure"), { status: 502 }));
    const result = await processMarketingContentReview(app.store, "123", app.send, app.options);
    expect(result.status).toBe("delivery_unknown");
    expect(app.row.message_ids).toEqual([41]);
    expect(app.row.document_complete).toBe(false);
    expect(app.send.mock.calls.some(([, payload]) => payload.reply_markup)).toBe(false);
  });

  it("treats a lost database acknowledgement after a sent photo as uncertain", async () => {
    const app = fixture();
    vi.mocked(app.store.recordDelivery).mockRejectedValueOnce(new Error("database timeout"));
    const result = await processMarketingContentReview(app.store, "123", app.send, app.options);
    expect(result.status).toBe("delivery_unknown");
    expect(app.send).toHaveBeenCalledTimes(1);
    expect(app.row.document_complete).toBe(false);
  });

  it.each(["duplicate", "missing"])("never considers a document complete with a %s persisted acknowledgement", async failure => {
    const app = fixture();
    if (failure === "duplicate") app.send.mockResolvedValue({ message_id: 42, chat: { id: 123 } });
    else {
      const record = app.store.recordDelivery;
      app.store.recordDelivery = vi.fn((reviewId, delivery) => delivery.messageIds ? Promise.resolve(app.row) : record(reviewId, delivery));
    }
    expect((await processMarketingContentReview(app.store, "123", app.send, app.options)).status).toBe("delivery_unknown");
    expect(app.row.document_complete).toBe(false);
    expect(app.send.mock.calls.some(([, payload]) => payload.reply_markup)).toBe(false);
  });

  it("times out a hanging provider promise and ignores a late acknowledgement", async () => {
    const app = fixture();
    let acknowledge!: (value: { message_id: number; chat: { id: number } }) => void;
    app.send.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
    const processing = processMarketingContentReview(app.store, "123", app.send, app.options);
    await vi.waitFor(() => expect(app.send).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await processing).status).toBe("delivery_unknown");
    const records = vi.mocked(app.store.recordDelivery).mock.calls.length;
    acknowledge({ message_id: 42, chat: { id: 123 } });
    await Promise.resolve();
    expect(app.store.recordDelivery).toHaveBeenCalledTimes(records);
    expect(app.row.message_ids).toEqual([]);
    expect(app.send).toHaveBeenCalledTimes(1);
  });

  it("never exposes a decision token when document completeness could not be persisted", async () => {
    const app = fixture();
    const record = app.store.recordDelivery;
    app.store.recordDelivery = vi.fn(async (reviewId, delivery) => {
      if (delivery.documentComplete) throw new Error("write failed");
      return record(reviewId, delivery);
    });
    const result = await processMarketingContentReview(app.store, "123", app.send, app.options);
    expect(result.status).toBe("delivery_unknown");
    expect(app.row.document_complete).toBe(false);
    expect(app.send.mock.calls.some(([, payload]) => payload.reply_markup)).toBe(false);
  });

  it("allows a genuine final callback after a lost final ACK only when the complete document was persisted", async () => {
    const app = fixture();
    const send = app.send.getMockImplementation()!;
    app.send.mockImplementation(async (method, payload) => {
      if (payload.reply_markup) throw new Error("final response lost");
      return send(method, payload);
    });
    const result = await processMarketingContentReview(app.store, "123", app.send, app.options);
    expect(result.status).toBe("delivery_unknown");
    expect(app.row.document_complete).toBe(true);
    expect(app.row.control_message_id).toBeNull();
    const data = decisionData(app.send);
    app.row.document_complete = false;
    await expect(decideMarketingContentReview(app.store, data, "123", 99, actor)).rejects.toThrow();
    app.row.document_complete = true;
    expect((await decideMarketingContentReview(app.store, data, "123", 99, actor)).status).toBe("approved");
    await expect(decideMarketingContentReview(app.store, data.replace("mcv:a:", "mcv:r:"), "123", 99, actor)).rejects.toThrow();
  });

  it("preserves a full native 32-post campaign in a private chat", async () => {
    const app = fixture(snapshot(32));
    const result = await processMarketingContentReview(app.store, "123", app.send, app.options);
    expect(result.status).toBe("pending");
    expect(app.send.mock.calls.filter(([method]) => method === "sendPhoto")).toHaveLength(32);
    expect(app.send.mock.calls.filter(([, payload]) => payload.reply_markup)).toHaveLength(1);
    expect(app.options.now() - NOW).toBeLessThan(140_000);
  });

  it("uses group pacing and rejects a dossier that cannot fit the budget before sending anything", async () => {
    const small = fixture(snapshot(1, "item"), "-123");
    expect((await processMarketingContentReview(small.store, "-123", small.send, small.options)).status).toBe("pending");
    expect(small.options.sleep.mock.calls.map(([delay]) => delay)).toEqual([3100, 3100]);
    const large = fixture(snapshot(32), "-123");
    expect(await processMarketingContentReview(large.store, "-123", large.send, large.options))
      .toMatchObject({ status: "failed", errorCode: "content_review_document_too_large" });
    expect(large.send).not.toHaveBeenCalled();
  });

  it("stops before the next request when slow acknowledgements consume the remaining budget", async () => {
    const app = fixture();
    const send = app.send.getMockImplementation()!;
    app.send.mockImplementation(async (method, payload) => { app.advance(4000); return send(method, payload); });
    const result = await processMarketingContentReview(app.store, "123", app.send, { ...app.options, budgetMs: 12_000, sendTimeoutMs: 1000 });
    expect(result).toMatchObject({ status: "failed", errorCode: "content_review_budget_exhausted" });
    expect(app.send).toHaveBeenCalledTimes(3);
    expect(app.send.mock.calls.some(([, payload]) => payload.reply_markup)).toBe(false);
  });

  it("rejects an invalid or wrong-chat acknowledgement as unknown", async () => {
    for (const acknowledgement of [{}, { message_id: 0 }, { message_id: 42, chat: { id: 999 } }]) {
      const app = fixture();
      app.send.mockResolvedValueOnce(acknowledgement as { message_id: number; chat: { id: number } });
      expect((await processMarketingContentReview(app.store, "123", app.send, app.options)).status).toBe("delivery_unknown");
      expect(app.row.document_complete).toBe(false);
    }
  });
});

describe("Marketing content decisions and service store", () => {
  it("rejects an expired decision and a different message or chat", async () => {
    const app = fixture();
    await processMarketingContentReview(app.store, "123", app.send, app.options);
    const data = decisionData(app.send);
    await expect(decideMarketingContentReview(app.store, data, "999", app.row.control_message_id!, actor)).rejects.toThrow();
    await expect(decideMarketingContentReview(app.store, data, "123", 999, actor)).rejects.toThrow();
    app.row.expires_at = new Date(NOW - 1).toISOString();
    await expect(decideMarketingContentReview(app.store, data, "123", app.row.control_message_id!, actor)).rejects.toThrow();
  });

  it("rejects malformed callback credentials before reaching SQL", async () => {
    const app = fixture();
    const valid = `mcv:a:${"a".repeat(36)}`;
    for (const [data, messageId, user] of [[valid.replace("mcv", "igv"), 42, actor], ["mcv:a:short", 42, actor],
      [valid, 0, actor], [valid, 42, "browser:456"], [valid, 42, "telegram:456:admin\nspoof"]] as const) {
      await expect(decideMarketingContentReview(app.store, data, "123", messageId, user)).rejects.toThrow("invalid_content_review_decision");
    }
    expect(app.store.decide).not.toHaveBeenCalled();
  });

  it("uses only service review RPCs and never calls a programming or publication operation", async () => {
    const app = fixture();
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: app.row as unknown, error: null as unknown }));
    const store = createMarketingContentReviewStore({ rpc });
    await store.claim("a".repeat(64), "123");
    await store.recordDelivery(app.row.id, { outcome: "failed", errorCode: "content_review_visual_invalid" });
    await store.decide("a".repeat(64), "123", 42, "approved", actor);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_marketing_content_review", "record_marketing_content_review_delivery", "decide_marketing_content_review",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_outcome: "failed", p_error_code: "content_review_visual_invalid" });
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_actor: actor, p_decision: "approved" });
  });

  it("stops after a SQL revision conflict without issuing another delivery update or exposing buttons", async () => {
    const app = fixture();
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => ({ data: name === "claim_marketing_content_review" ? app.row : null, error: null }));
    const store = createMarketingContentReviewStore({ rpc });
    await expect(processMarketingContentReview(store, "123", app.send, app.options)).rejects.toMatchObject({ status: 409 });
    expect(app.send).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["claim_marketing_content_review", "record_marketing_content_review_delivery"]);
    expect(app.send.mock.calls.some(([, payload]) => payload.reply_markup)).toBe(false);
  });
});
