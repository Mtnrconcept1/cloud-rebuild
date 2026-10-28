import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

export const PLINKO_OUTCOMES = ["free_meal", "half_price", "tok_one_month", "replay", "lost"] as const;
export type PlinkoOutcome = typeof PLINKO_OUTCOMES[number];
export type PlinkoPlay = {
  id: string;
  requestId?: string;
  outcome: PlinkoOutcome;
  createdAt: string;
  rewardId?: string;
};
export type PlinkoReward = {
  id: string;
  outcome: PlinkoOutcome;
  label: string;
  status: "pending_email" | "pending_fulfillment" | "fulfilled" | "cancelled";
  claimInstructions?: string;
};
export type PlinkoState = {
  ok: boolean;
  enabled: boolean;
  available: boolean;
  token?: string;
  expiresAt?: string;
  play: PlinkoPlay | null;
  reward: PlinkoReward | null;
};

export const PLINKO_PRIZES: Record<PlinkoOutcome, { label: string; short: string; chance: string; description: string }> = {
  free_meal: { label: "Un repas offert", short: "Repas offert", chance: "0,5 %", description: "Le chef vous invite à table !" },
  half_price: { label: "−50 % sur un repas", short: "−50 %", chance: "0,5 %", description: "Dans le restaurant de votre choix." },
  tok_one_month: { label: "Un mois de Tok One offert", short: "Tok One", chance: "33 %", description: "Un mois pour découvrir les avantages Tok One." },
  replay: { label: "Un coup gratuit à rejouer", short: "Rejouer", chance: "33 %", description: "Votre prochain Miamz est prêt. À vous de jouer !" },
  lost: { label: "Pas de gain cette fois", short: "Perdu", chance: "33 %", description: "Merci d’avoir tenté votre chance avec le chef." },
};

export function isPlinkoSurface(pathname: string) {
  return pathname === "/" || pathname === "/recherche" || /^\/restaurants?\//.test(pathname)
    || ["/anti-gaspi", "/ventes-flash", "/tok-one", "/actualites"].includes(pathname);
}

export function parsePlinkoState(value: unknown): PlinkoState {
  if (!value || typeof value !== "object") throw new Error("Réponse du jeu invalide. Réessayez sans relancer un nouveau tirage.");
  const state = value as PlinkoState;
  if (state.ok !== true || typeof state.available !== "boolean" || typeof state.enabled !== "boolean"
    || state.play === undefined || state.reward === undefined
    || (state.token !== undefined && (typeof state.token !== "string" || state.token.length === 0))
    || (state.play && (typeof state.play.id !== "string" || !PLINKO_OUTCOMES.includes(state.play.outcome)))
    || (state.reward && (typeof state.reward.id !== "string" || !PLINKO_OUTCOMES.includes(state.reward.outcome)
      || typeof state.reward.label !== "string" || !["pending_email", "pending_fulfillment", "fulfilled", "cancelled"].includes(state.reward.status)))
    || (state.play && ["free_meal", "half_price", "tok_one_month"].includes(state.play.outcome) && !state.reward)
    || (state.reward && (!state.play || state.reward.outcome !== state.play.outcome || ["replay", "lost"].includes(state.reward.outcome)))) {
    throw new Error("Réponse du jeu invalide. Réessayez sans relancer un nouveau tirage.");
  }
  return state;
}

export class PlinkoSessionExpiredError extends Error {}

async function requestPlinko(body: Record<string, unknown>, requestId?: string): Promise<PlinkoState> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Le jeu est momentanément indisponible.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/plinko-play`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(requestId ? { "Idempotency-Key": requestId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    credentials: "omit",
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new PlinkoSessionExpiredError("Cette partie a expiré.");
    // Never display internal database errors or reflect a submitted address.
    throw new Error(response.status === 429
      ? "Un peu de patience : trop de tentatives rapprochées. Réessayez plus tard."
      : response.status === 409
        ? "Un gain a déjà été demandé avec cette adresse e-mail."
        : "Impossible de joindre le chef. Réessayez : votre tirage sera conservé.");
  }
  return parsePlinkoState(result);
}

export const startPlinkoSession = () => requestPlinko({ action: "start" });
export const getPlinkoStatus = (token: string) => requestPlinko({ action: "status", token });
export const playPlinko = (token: string, requestId: string) => requestPlinko({ action: "play", token }, requestId);
export const claimPlinko = (token: string, requestId: string, email: string, marketingConsent: boolean) =>
  requestPlinko({ action: "claim", token, email: email.trim(), marketingConsent }, requestId);
