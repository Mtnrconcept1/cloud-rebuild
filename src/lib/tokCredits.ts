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
