export const PLINKO_RULE_VERSION = "welcome-v1";
export const PLINKO_FEATURE_FLAG = "plinko-welcome";
export const PLINKO_TOTAL_WEIGHT = 10_000;

// Integer tickets describe each individual drop, including free replay drops.
export const PLINKO_OUTCOME_WEIGHTS = [
  { outcome: "free_meal", weight: 50 },
  { outcome: "half_price", weight: 50 },
  { outcome: "tok_one_month", weight: 3300 },
  { outcome: "replay", weight: 3300 },
  { outcome: "lost", weight: 3300 },
] as const;

export type PlinkoOutcome = typeof PLINKO_OUTCOME_WEIGHTS[number]["outcome"];

const UINT32_RANGE = 0x1_0000_0000;

export function secureRandomTicket(): number {
  // Rejection sampling avoids modulo bias; every ticket has equal probability.
  const limit = Math.floor(UINT32_RANGE / PLINKO_TOTAL_WEIGHT) * PLINKO_TOTAL_WEIGHT;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % PLINKO_TOTAL_WEIGHT;
}

export function pickPlinkoOutcome(randomTicket: () => number = secureRandomTicket): PlinkoOutcome {
  let ticket = randomTicket();
  if (!Number.isInteger(ticket) || ticket < 0 || ticket >= PLINKO_TOTAL_WEIGHT) {
    throw new Error("invalid_plinko_ticket");
  }
  for (const rule of PLINKO_OUTCOME_WEIGHTS) {
    if (ticket < rule.weight) return rule.outcome;
    ticket -= rule.weight;
  }
  throw new Error("invalid_plinko_weights");
}

export function readPlinkoRequestId(request: Request): string {
  const requestId = request.headers.get("Idempotency-Key")?.trim() || "";
  // A key is mandatory so an uncertain network response cannot consume a replay.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error("invalid_idempotency_key");
  }
  return requestId.toLowerCase();
}

export function createPlinkoToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPlinkoToken(token: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("invalid_plinko_token");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizePlinkoEmail(raw: unknown): string {
  if (typeof raw === "string" && Array.from(raw).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error("invalid_plinko_email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid_plinko_email");
  }
  return email;
}
