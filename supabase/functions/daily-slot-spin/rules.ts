export const SLOT_TIME_ZONE = "Europe/Zurich";
export const SLOT_RULE_VERSION = "2026-07-19-v3";
export const SLOT_MAX_ATTEMPTS_PER_DAY = 3;
export const SLOT_MIN_REWARD_POINTS = 3;

export const SLOT_SYMBOL_WEIGHTS = [
  { id: "tok_suisse", weight: 1 },
  { id: "fork", weight: 4 },
  { id: "chef", weight: 5 },
  { id: "courier", weight: 6 },
  { id: "logo", weight: 9 },
  { id: "miamz", weight: 10 },
] as const;

export type SlotSymbolId = typeof SLOT_SYMBOL_WEIGHTS[number]["id"];

export type SlotRewardRule = {
  points: number;
  label: string;
  ruleId: string;
};

type RandomInt = (maxExclusive: number) => number;

const UINT32_RANGE = 0x1_0000_0000;
const TOTAL_SYMBOL_WEIGHT = SLOT_SYMBOL_WEIGHTS.reduce(
  (sum, symbol) => sum + symbol.weight,
  0,
);

export function secureRandomInt(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("invalid_random_bound");
  }

  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);

  return buffer[0] % maxExclusive;
}

export function pickWeightedSlotSymbol(
  randomInt: RandomInt = secureRandomInt,
): SlotSymbolId {
  let ticket = randomInt(TOTAL_SYMBOL_WEIGHT);

  for (const symbol of SLOT_SYMBOL_WEIGHTS) {
    if (ticket < symbol.weight) return symbol.id;
    ticket -= symbol.weight;
  }

  return "miamz";
}

export function generateSlotSymbols(
  randomInt: RandomInt = secureRandomInt,
): SlotSymbolId[] {
  return [
    pickWeightedSlotSymbol(randomInt),
    pickWeightedSlotSymbol(randomInt),
    pickWeightedSlotSymbol(randomInt),
  ];
}

function countSymbols(symbols: readonly SlotSymbolId[]) {
  return symbols.reduce((counts, symbol) => {
    counts[symbol] = (counts[symbol] || 0) + 1;
    return counts;
  }, {} as Record<SlotSymbolId, number>);
}

/**
 * The paytable is order-independent. Every secure daily spin earns at least
 * SLOT_MIN_REWARD_POINTS so the loyalty experience never presents a fake loss.
 */
export function scoreSlotSymbols(
  symbols: readonly SlotSymbolId[],
): SlotRewardRule {
  if (symbols.length !== 3) {
    throw new Error("three_symbols_required");
  }

  const counts = countSymbols(symbols);
  const all = (symbol: SlotSymbolId) =>
    symbols.every((entry) => entry === symbol);
  const has = (symbol: SlotSymbolId, count: number) =>
    (counts[symbol] || 0) === count;

  if (all("tok_suisse")) {
    return { points: 100, label: "Jackpot TOK Suisse", ruleId: "triple_tok_suisse" };
  }
  if (all("fork")) {
    return { points: 60, label: "Triple monstre fourchette", ruleId: "triple_fork" };
  }
  if (all("chef")) {
    return { points: 45, label: "Triple chef TOK", ruleId: "triple_chef" };
  }
  if (all("courier")) {
    return { points: 40, label: "Triple livreur TOK", ruleId: "triple_courier" };
  }
  if (all("logo")) {
    return { points: 30, label: "Triple logo TOK", ruleId: "triple_logo" };
  }
  if (all("miamz")) {
    return { points: 24, label: "Triple bulle Miamz", ruleId: "triple_miamz" };
  }

  if (has("fork", 2) && has("chef", 1)) {
    return { points: 20, label: "Fourchettes + chef TOK", ruleId: "fork_pair_chef" };
  }
  if (has("chef", 2) && has("courier", 1)) {
    return { points: 16, label: "Duo chefs + livreur", ruleId: "chef_pair_courier" };
  }
  if (has("courier", 2) && has("fork", 1)) {
    return { points: 12, label: "Duo livreurs + fourchette", ruleId: "courier_pair_fork" };
  }
  if (has("logo", 2) && has("fork", 1)) {
    return { points: 10, label: "Duo logos + fourchette", ruleId: "logo_pair_fork" };
  }
  if (has("fork", 1) && has("chef", 1) && has("courier", 1)) {
    return { points: 8, label: "Équipe service complète", ruleId: "service_team" };
  }
  if (has("chef", 1) && has("logo", 2)) {
    return { points: 6, label: "Chef + deux logos TOK", ruleId: "chef_logo_pair" };
  }
  if (has("courier", 1) && has("logo", 2)) {
    return { points: 4, label: "Livreur + deux logos TOK", ruleId: "courier_logo_pair" };
  }

  if (Object.values(counts).some((count) => count === 2)) {
    return {
      points: SLOT_MIN_REWARD_POINTS,
      label: "Deux symboles identiques",
      ruleId: "any_pair",
    };
  }

  return {
    points: SLOT_MIN_REWARD_POINTS,
    label: "Bonus découverte TOK",
    ruleId: "daily_floor",
  };
}

