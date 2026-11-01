/** Verified 2026-11-01: https://developers.openai.com/api/docs/models/gpt-4.1-mini
 * Standard tier: $0.40 input / $1.60 output per million tokens.
 * Deliberately expires: no unknown model or fallback price is accepted.
 */
export const GROWTH_MODEL = "gpt-4.1-mini-2025-04-14";
export const GROWTH_MAX_OUTPUT_TOKENS = 8000;
export const GROWTH_MAX_INPUT_TOKENS = 100000;
export const GROWTH_MAX_REQUEST_BYTES = 60000;
const PRICE_VALID_UNTIL = Date.parse("2026-11-08T00:00:00.000Z");
// Conservative FX/tax allowance, NOT a current exchange-rate quote. Revalidate with prices.
const USD_TO_CHF_CEILING = 2;
export function growthReservationMicros(model: string, configuredCeiling: number | null, now = Date.now()): number | null {
    if (model !== GROWTH_MODEL || now >= PRICE_VALID_UNTIL || !Number.isSafeInteger(configuredCeiling) || configuredCeiling === null)
        return null;
    const required = Math.ceil((GROWTH_MAX_INPUT_TOKENS * 0.4 + GROWTH_MAX_OUTPUT_TOKENS * 1.6) * USD_TO_CHF_CEILING);
    return required <= configuredCeiling && configuredCeiling <= 100000000 ? required : null;
}
