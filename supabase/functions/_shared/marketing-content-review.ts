import { composeMetaCaption } from "./meta-publishing.ts";
import {
  MarketingContentReviewInputError, parseMarketingContentReviewRequest,
  type MarketingContentReviewRequest, type MarketingContentReviewStatus, type MarketingContentReviewTargetType,
} from "./marketing-content-review-request.ts";
export { MarketingContentReviewInputError, parseMarketingContentReviewRequest };
export type { MarketingContentReviewRequest, MarketingContentReviewStatus, MarketingContentReviewTargetType };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export type MarketingContentReviewItem = Record<string, unknown> & {
  id: string; title: string; channel: string; content: Record<string, unknown>;
  integration?: Record<string, unknown> | null;
};
export type MarketingContentReviewSnapshot = {
  schemaVersion: 1; targetType: MarketingContentReviewTargetType; targetId: string; revision: number;
  campaign: (Record<string, unknown> & { id: string; name: string }) | null;
  items: MarketingContentReviewItem[];
};
export type MarketingContentReviewView = {
  id: string; target_type: MarketingContentReviewTargetType; target_id: string; revision: number;
  status: MarketingContentReviewStatus; created_at: string; expires_at: string; decided_at: string | null;
  delivery_complete: boolean; message_count: number; last_error_code?: string | null;
};
export type MarketingContentReviewMessage = {
  kind: "media" | "text"; method: "sendPhoto" | "sendMessage"; payload: Record<string, unknown>;
};
export type MarketingContentReviewDocument = { messages: MarketingContentReviewMessage[]; mediaCount: number; itemCount: number };

// The bundle RPC accepts 32 items. The delivery bound also accommodates 32 short
// illustrated posts; larger transcripts fail before any Telegram request.
export const MARKETING_CONTENT_REVIEW_MAX_ITEMS = 32;
export const MARKETING_CONTENT_REVIEW_MAX_MESSAGES = 96;
export const MARKETING_CONTENT_REVIEW_TEXT_LIMIT = 4096;

export class MarketingContentReviewDocumentError extends Error {
  constructor(public code: string) { super(code); this.name = "MarketingContentReviewDocumentError"; }
}
function documentError(code = "content_review_snapshot_invalid"): never { throw new MarketingContentReviewDocumentError(code); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function checkedText(value: string): string {
  if ([...value].some(character => { const code = character.charCodeAt(0); return code === 127 || (code < 32 && ![9, 10, 13].includes(code)); })) documentError();
  return value;
}
function json(value: unknown): string {
  try { return checkedText(JSON.stringify(value ?? null, null, 2)); }
  catch (error) { if (error instanceof MarketingContentReviewDocumentError) throw error; return documentError(); }
}
function swissDate(value: unknown): string {
  if (!text(value)) return "À définir";
  const date = new Date(text(value));
  if (!Number.isFinite(date.getTime())) return documentError();
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" }).format(date);
}
function audience(value: unknown): string {
  if (!object(value)) return "À consulter dans TOK";
  const parts: string[] = [];
  if (value.audience_kind === "restaurant") parts.push("Restaurants");
  if (value.audience_kind === "client") parts.push("Clients");
  const facets: Array<[string[], string, string]> = [
    [["city", "cities"], "Ville", "Villes"], [["canton", "cantons"], "Canton", "Cantons"],
    [["country", "countries"], "Pays", "Pays"], [["language", "languages"], "Langue", "Langues"],
    [["segments"], "Segment", "Segments"], [["restaurant_categories"], "Catégorie de restaurant", "Catégories de restaurants"],
    [["contact_types"], "Type de contact", "Types de contacts"],
  ];
  for (const [keys, singular, plural] of facets) {
    const values = keys.flatMap(key => Array.isArray(value[key]) ? value[key] : [value[key]]);
    const selected = [...new Set(values.map(text).filter(Boolean))];
    if (selected.length) parts.push(`${selected.length === 1 ? singular : plural} : ${selected.join(", ")}`);
  }
  if (typeof value.subscribed_only === "boolean") parts.push(`Abonnés uniquement : ${value.subscribed_only ? "oui" : "non"}`);
  if (Number.isSafeInteger(value.selected_recipient_count) && Number(value.selected_recipient_count) >= 0) {
    parts.push(`Destinataires sélectionnés : ${value.selected_recipient_count}`);
  }
  return parts.join(" · ") || "À consulter dans TOK";
}
function campaignEditorial(value: unknown): string {
  if (!object(value)) return "";
  const parts: string[] = [];
  for (const [key, label] of [["message", "Message"], ["summary", "Résumé"]]) {
    if (text(value[key])) parts.push(`${label}\n${text(value[key])}`);
  }
  const composed = composeMetaCaption(value);
  if (composed) parts.push(composed);
  return parts.length ? `\n\nCONTENU DE LA CAMPAGNE\n${parts.join("\n\n")}` : "";
}

/** Defensive decoding of the private, canonical SQL snapshot, never a client draft. */
export function parseMarketingContentReviewSnapshot(input: unknown): MarketingContentReviewSnapshot {
  if (!object(input) || input.schemaVersion !== 1 || (input.targetType !== "campaign" && input.targetType !== "item")
    || typeof input.targetId !== "string" || !UUID.test(input.targetId)
    || !Number.isSafeInteger(input.revision) || Number(input.revision) < 1 || !Array.isArray(input.items)) return documentError();
  if (input.items.length < 1) return documentError("content_review_items_missing");
  if (input.items.length > MARKETING_CONTENT_REVIEW_MAX_ITEMS || json(input).length > 512_000) return documentError("content_review_document_too_large");
  const ids = new Set<string>();
  for (const item of input.items) {
    if (!object(item) || typeof item.id !== "string" || !UUID.test(item.id) || ids.has(item.id)
      || !text(item.title) || !text(item.channel) || !object(item.content)
      || (item.integration !== undefined && item.integration !== null && !object(item.integration))) return documentError();
    ids.add(item.id);
  }
  if (input.targetType === "item" && (input.items.length !== 1 || input.items[0].id !== input.targetId)) return documentError();
  if (input.campaign !== null && (!object(input.campaign) || typeof input.campaign.id !== "string"
    || !UUID.test(input.campaign.id) || !text(input.campaign.name))) return documentError();
  if (input.targetType === "campaign" && (!object(input.campaign) || input.campaign.id !== input.targetId)) return documentError();
  return input as MarketingContentReviewSnapshot;
}

/** Bounded UTF-16 chunks, keeping surrogate pairs and the complete original text. */
export function splitMarketingReviewText(value: string, limit = MARKETING_CONTENT_REVIEW_TEXT_LIMIT): string[] {
  if (!Number.isSafeInteger(limit) || limit < 2 || limit > MARKETING_CONTENT_REVIEW_TEXT_LIMIT) return documentError();
  checkedText(value);
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length;) {
    let end = Math.min(offset + limit, value.length);
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xD800 && last <= 0xDBFF) end -= 1;
    chunks.push(value.slice(offset, end));
    offset = end;
  }
  return chunks;
}

/** Only public server-created media, outside restaurant-writable prefixes, may leave TOK. */
export function marketingContentReviewMediaUrl(value: unknown, supabaseUrl: string): string {
  try {
    const origin = new URL(supabaseUrl);
    const url = new URL(text(value));
    const prefix = "/storage/v1/object/public/social-post-media/";
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.port
      || url.protocol !== "https:" || url.origin !== origin.origin || url.username || url.password || url.port
      || url.search || url.hash || !url.pathname.startsWith(prefix) || url.href.length > 2048) return documentError("content_review_visual_invalid");
    const parts = url.pathname.slice(prefix.length).split("/");
    if (parts.length < 2 || !["marketing-ai", "marketing-mailing"].includes(parts[0])
      || parts.some(part => !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(part))
      || !/\.(?:jpe?g|png|webp)$/i.test(parts[parts.length - 1])) return documentError("content_review_visual_invalid");
    return url.href;
  } catch (error) {
    if (error instanceof MarketingContentReviewDocumentError) throw error;
    return documentError("content_review_visual_invalid");
  }
}

function caption(item: MarketingContentReviewItem): string {
  const content = item.content;
  const composed = composeMetaCaption(content);
  // Match the Studio preview for manually authored drafts; caption is the last
  // legacy fallback. Meta publishing still validates composeMetaCaption itself.
  const fallback = text(content.message) || text(content.body) || text(content.text) || text(content.summary) || text(content.caption);
  const meta = item.channel === "instagram" || item.channel === "facebook";
  const value = meta ? composed || fallback
    : item.channel === "email" ? [text(content.subject), composed || fallback].filter(Boolean).join("\n\n")
      : fallback || composed;
  if (!value) return documentError("content_review_text_missing");
  return checkedText(value);
}

/** All photos first, then the complete transcript. No decision credentials here. */
export function buildMarketingContentReviewDocument(
  input: MarketingContentReviewSnapshot, options: { supabaseUrl: string },
): MarketingContentReviewDocument {
  const snapshot = parseMarketingContentReviewSnapshot(input);
  const media: MarketingContentReviewMessage[] = [];
  const transcripts: string[] = [];
  const campaign = snapshot.campaign;
  if (campaign) transcripts.push(`TOK · Dossier de validation\nCampagne : ${campaign.name}\nObjectif : ${text(campaign.objective)}\nCanaux : ${Array.isArray(campaign.channels) ? campaign.channels.filter(channel => typeof channel === "string").join(", ") : "À consulter dans TOK"}\nAudience : ${text(campaign.audience_name) || audience(campaign.audience_definition)}\n${audience(campaign.audience_definition)}\nPériode proposée : ${swissDate(campaign.starts_at)} → ${swissDate(campaign.ends_at)} (heure suisse)${campaignEditorial(campaign.content)}\n\nRéférence : ${campaign.id} · révision ${snapshot.revision}`);
  for (const [index, item] of snapshot.items.entries()) {
    const content = item.content;
    const visual = text(content.visual_url);
    const visualStatus = text(content.visual_status);
    const expectsVisual = item.channel === "instagram" || content.visual_required === true || Boolean(text(content.visual_prompt))
      || Boolean(visualStatus && !["not_requested", "not_required", "text_only"].includes(visualStatus));
    if ((!visual && expectsVisual) || (visual && visualStatus && visualStatus !== "ready")) return documentError("content_review_visual_missing");
    if (visual) {
      const url = marketingContentReviewMediaUrl(visual, options.supabaseUrl);
      media.push({ kind: "media", method: "sendPhoto", payload: {
        photo: url, caption: `TOK · Visuel ${index + 1}/${snapshot.items.length}\nPublication : ${item.id}`, protect_content: true,
      } });
    }
    const integration = item.integration ?? {};
    const manualMeta = ["instagram", "facebook"].includes(item.channel) && !composeMetaCaption(content);
    const captionNotice = manualMeta ? "\nTexte de brouillon manuel : le contenu Meta doit être complété dans TOK avant diffusion." : "";
    transcripts.push(`PUBLICATION ${index + 1}/${snapshot.items.length} · ${item.title}\nCanal : ${item.channel}\nCompte : ${text(integration.account_username) || text(integration.account_id) || "Non renseigné"}\nDate proposée : ${swissDate(item.scheduled_at)} (heure suisse)\nAudience : ${text(item.audience_name) || audience(item.targeting)}\n${audience(item.targeting)}\nFormat visuel : ${text(content.visual_format) || text(content.format) || "Non renseigné"}\nRéférence : ${item.id}${captionNotice}\n\nTEXTE EXACT\n${caption(item)}`);
  }
  const messages = [...media, ...transcripts.flatMap(transcript => splitMarketingReviewText(transcript).map(chunk => ({
    kind: "text" as const, method: "sendMessage" as const,
    payload: { text: chunk, link_preview_options: { is_disabled: true }, protect_content: true },
  })))];
  if (messages.length + 1 > MARKETING_CONTENT_REVIEW_MAX_MESSAGES) return documentError("content_review_document_too_large");
  return { messages, mediaCount: media.length, itemCount: snapshot.items.length };
}

export function marketingContentReviewControlMessage(snapshot: MarketingContentReviewSnapshot, token: string, expiresAt: string) {
  if (!/^[0-9a-f]{36}$/.test(token) || !Number.isFinite(Date.parse(expiresAt))) return documentError();
  const link = new URL("https://marketing.thetok.ch/marketing");
  link.searchParams.set("view", snapshot.targetType === "campaign" ? "campaigns" : "calendar");
  link.searchParams.set(snapshot.targetType === "campaign" ? "campaignId" : "itemId", snapshot.targetId);
  const title = snapshot.targetType === "campaign" ? snapshot.campaign?.name : snapshot.items[0]?.title;
  const controlText = `TOK · Décision sur le contenu\n${title}\nDossier complet : ${snapshot.items.length} publication(s), textes et visuels ci-dessus.\n\nCette validation porte sur le contenu. La diffusion suit la programmation confirmée dans TOK. Toute modification nécessitera une nouvelle validation.\n\nValable jusqu’au ${swissDate(expiresAt)} (heure suisse).\nRéférence : ${snapshot.targetId} · révision ${snapshot.revision}`;
  if (controlText.length > MARKETING_CONTENT_REVIEW_TEXT_LIMIT) return documentError("content_review_document_too_large");
  return {
    text: checkedText(controlText),
    link_preview_options: { is_disabled: true }, protect_content: true,
    reply_markup: { inline_keyboard: [
      [{ text: "Valider le contenu", callback_data: `mcv:a:${token}` }, { text: "Refuser", callback_data: `mcv:r:${token}` }],
      [{ text: "Ouvrir dans TOK Marketing", url: link.href }],
    ] },
  };
}

export type ContentReviewRequest = MarketingContentReviewRequest;
export type ContentReviewView = MarketingContentReviewView;
export type ContentReviewStatus = MarketingContentReviewStatus;
export type ContentReviewTargetType = MarketingContentReviewTargetType;
export const parseContentReviewRequest = parseMarketingContentReviewRequest;
