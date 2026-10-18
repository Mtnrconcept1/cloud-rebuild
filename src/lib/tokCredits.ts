export const TOK_CREDITS_PER_CAMPAIGN_CHF = 15;
export const TOK_AI_SIMPLE_REQUEST_CREDITS = 1;
export const TOK_AI_STRATEGIC_REQUEST_CREDITS = 5;
export const TOK_PHOTO_SIMPLE_CREDITS = 6;
export const TOK_PHOTO_PRO_CREDITS = 6;
export const TOK_MARKETING_FLYER_CREDITS = 6;
export const TOK_DEMO_UNLIMITED_CREDIT_THRESHOLD = 1000000000;

type TokCreditSource = {
  campaign_credit_chf?: number | string | null;
  ai_tool_credits?: number | string | null;
  ai_photo_credits?: number | string | null;
};

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getTokCreditAmount(source: TokCreditSource) {
  return Math.max(0, Math.round(
    toNumber(source.campaign_credit_chf) * TOK_CREDITS_PER_CAMPAIGN_CHF
      + toNumber(source.ai_tool_credits)
      + toNumber(source.ai_photo_credits),
  ));
}

export function formatTokCredits(value: unknown) {
  const credits = toNumber(value);
  if (credits >= TOK_DEMO_UNLIMITED_CREDIT_THRESHOLD) {
    return "Crédits TOK démo illimités";
  }
  return `${credits.toLocaleString("fr-CH")} crédits TOK`;
}

export function getCampaignEquivalentChf(credits: unknown) {
  return Math.floor(toNumber(credits) / TOK_CREDITS_PER_CAMPAIGN_CHF);
}

export function getAiSimpleRequestEquivalent(credits: unknown) {
  return Math.floor(toNumber(credits) / TOK_AI_SIMPLE_REQUEST_CREDITS);
}

export function getPhotoSimpleEquivalent(credits: unknown) {
  return Math.floor(toNumber(credits) / TOK_PHOTO_SIMPLE_CREDITS);
}

export function getPhotoProEquivalent(credits: unknown) {
  return Math.floor(toNumber(credits) / TOK_PHOTO_PRO_CREDITS);
}

export function getMarketingFlyerEquivalent(credits: unknown) {
  return Math.floor(toNumber(credits) / TOK_MARKETING_FLYER_CREDITS);
}

/** Preserve ledger amounts; distinguish held credits from a delivered image. */
export function getTokImageReservationDisplay(entry: {
  source_table?: string; label?: string; description?: string | null; metadata?: Record<string, unknown> | null;
}): { label: string; description: string } | null {
  if (entry.source_table !== "ai_usage_logs") return null;
  const metadata = entry.metadata || {};
  const phase = metadata.billing_phase;
  if (phase === "completed" || phase === "released") return null;
  const action = metadata.action || entry.description;
  const state = metadata.state || metadata.operation_state;
  if (!(phase === "reserved" && metadata.image_operation_id)
    && action !== "image_credit_reservation" && action !== "image_generation_reservation"
    && !(["reserved", "provider_started", "indeterminate", "cleanup_pending"].includes(String(state)) && metadata.operation_id)) return null;
  return {
    label: "Crédits réservés pour une image",
    description: "Le traitement ou sa vérification est en cours. Cette réservation ne confirme pas la livraison d’une image.",
  };
}
