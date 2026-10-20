/** Shared, dependency-free contract; never accepts a Telegram destination. */
export type InstagramReviewDraft = {
  action: "instagram_review_submit";
  postUrl: string;
  username: string;
  commentText: string;
  commentLikes: number | null;
  replyText: string;
  observation: "manual" | "workspace";
};
export type InstagramReviewStatus = "delivering" | "pending" | "delivery_unknown" | "approved" | "rejected" | "expired";
export type InstagramReviewView = {
  id: string; status: InstagramReviewStatus; payload: InstagramReviewDraft;
  createdAt: string; expiresAt: string; decidedAt: string | null;
};
export class InstagramReviewInputError extends Error {}
export function parseInstagramReviewRequest(input: unknown): InstagramReviewDraft | { action: "instagram_review_list" } {
  const fail = (): never => { throw new InstagramReviewInputError("Demande de validation Instagram invalide."); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
  const row = input as Record<string, unknown>;
  if (row.action === "instagram_review_list" && Object.keys(row).length === 1) return { action: "instagram_review_list" };
  const keys = ["action", "postUrl", "username", "commentText", "commentLikes", "replyText", "observation"];
  if (row.action !== "instagram_review_submit" || Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) return fail();
  const text = (key: string, max: number) => {
    const value = row[key];
    if (typeof value !== "string" || !value.trim() || value.length > max
      || [...value].some(char => { const code = char.charCodeAt(0); return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13); })) return fail();
    return value.trim();
  };
  const postUrl = text("postUrl", 200);
  if (!/^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]{1,100}\/$/.test(postUrl)) return fail();
  const username = text("username", 30);
  if (!/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(username) || username.includes("..")) return fail();
  const commentText = text("commentText", 2200), replyText = text("replyText", 2200);
  const mentions = replyText.match(/@[A-Za-z0-9_.]+/g) || [];
  if (!mentions.some(mention => mention.toLowerCase() === `@${username.toLowerCase()}`)) return fail();
  if (row.commentLikes !== null && (typeof row.commentLikes !== "number" || !Number.isSafeInteger(row.commentLikes) || row.commentLikes < 0)) return fail();
  if (row.observation !== "manual" && row.observation !== "workspace") return fail();
  return { action: "instagram_review_submit", postUrl, username, commentText, replyText, commentLikes: row.commentLikes as number | null, observation: row.observation };
}

export function telegramReviewMessage(draft: InstagramReviewDraft, token: string, expiresAt: string) {
  // Plain text only: user content cannot inject Telegram markup. Keep the exact
  // proposed reply in full; explicitly label any shortened comment as an excerpt.
  const comment = draft.commentText.length > 1000 ? draft.commentText.slice(0, 1000) + "… [extrait]" : draft.commentText;
  const text = `TOK · Validation Instagram\nAuteur : @${draft.username}\nJ’aime observés : ${draft.commentLikes ?? "inconnus"}\nSource : ${draft.observation === "manual" ? "saisie manuelle" : "sélection dans le Studio (à vérifier)"}\n${draft.postUrl}\n\nCOMMENTAIRE\n${comment}\n\nRÉPONSE PROPOSÉE — TEXTE EXACT\n${draft.replyText}\n\nValable jusqu’au ${expiresAt}. Valider autorise ce texte pour une publication manuelle dans Instagram. Aucun envoi Instagram automatique.`;
  return { text, link_preview_options: { is_disabled: true }, protect_content: true, reply_markup: { inline_keyboard: [
    [{ text: "Valider", callback_data: `igv:a:${token}` }, { text: "Refuser", callback_data: `igv:r:${token}` }],
    [{ text: "Voir la publication Instagram", url: draft.postUrl }],
  ] } };
}
