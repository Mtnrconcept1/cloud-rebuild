import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const FUNCTION_NAME = "daily-slot-spin";
const SLOT_TIME_ZONE = "Europe/Zurich";
const SLOT_RULE_VERSION = "2026-06-25-v2";
const SLOT_MAX_ATTEMPTS_PER_DAY = 3;

const SLOT_SYMBOL_WEIGHTS = [
  // High-value symbols intentionally have lower weights: top paytable rows stay rarer than low combinations.
  { id: "tok_suisse", weight: 1 },
  { id: "fork", weight: 4 },
  { id: "chef", weight: 5 },
  { id: "courier", weight: 6 },
  { id: "logo", weight: 9 },
  { id: "miamz", weight: 10 },
] as const;

type SlotSymbolId = typeof SLOT_SYMBOL_WEIGHTS[number]["id"];

type RewardRule = {
  points: number;
  label: string;
  ruleId: string;
};

type SlotSpinRow = {
  id: string;
  spin_date: string;
  attempt_number: number;
  symbols: SlotSymbolId[];
  reward_points: number;
  reward_label: string;
  created_at: string;
};

type RpcSpinResult = {
  ok?: boolean;
  already_claimed?: boolean;
  spin?: SlotSpinRow | null;
  total_loyalty_points?: number | null;
  attempts_used?: number | null;
  attempts_remaining?: number | null;
  max_attempts?: number | null;
};

const UINT32_RANGE = 0x1_0000_0000;
const totalSymbolWeight = SLOT_SYMBOL_WEIGHTS.reduce((sum, symbol) => sum + symbol.weight, 0);

function currentZurichDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SLOT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function secureRandomInt(maxExclusive: number) {
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

function pickWeightedSymbol(): SlotSymbolId {
  let ticket = secureRandomInt(totalSymbolWeight);

  for (const symbol of SLOT_SYMBOL_WEIGHTS) {
    if (ticket < symbol.weight) return symbol.id;
    ticket -= symbol.weight;
  }

  return "logo";
}

function generateSymbols(): SlotSymbolId[] {
  return [pickWeightedSymbol(), pickWeightedSymbol(), pickWeightedSymbol()];
}

function countSymbols(symbols: SlotSymbolId[]) {
  return symbols.reduce((counts, symbol) => {
    counts[symbol] = (counts[symbol] || 0) + 1;
    return counts;
  }, {} as Record<SlotSymbolId, number>);
}

function scoreSymbols(symbols: SlotSymbolId[]): RewardRule {
  const counts = countSymbols(symbols);
  const all = (symbol: SlotSymbolId) => symbols.every((entry) => entry === symbol);
  const has = (symbol: SlotSymbolId, count: number) => (counts[symbol] || 0) === count;

  if (all("tok_suisse")) return { points: 100, label: "Jackpot TOK Suisse", ruleId: "triple_tok_suisse" };
  if (all("fork")) return { points: 60, label: "Triple monstre fourchette", ruleId: "triple_fork" };
  if (all("chef")) return { points: 45, label: "Triple chef TOK", ruleId: "triple_chef" };
  if (all("courier")) return { points: 40, label: "Triple livreur TOK", ruleId: "triple_courier" };
  if (all("logo")) return { points: 30, label: "Triple logo TOK", ruleId: "triple_logo" };
  if (all("miamz")) return { points: 24, label: "Triple bulle Miamz", ruleId: "triple_miamz" };

  if (has("fork", 2) && has("chef", 1)) return { points: 20, label: "Fourchette + chef TOK", ruleId: "fork_pair_chef" };
  if (has("chef", 2) && has("courier", 1)) return { points: 16, label: "Duo chefs + livreur", ruleId: "chef_pair_courier" };
  if (has("courier", 2) && has("fork", 1)) return { points: 12, label: "Duo livreurs + fourchette", ruleId: "courier_pair_fork" };
  if (has("logo", 2) && has("fork", 1)) return { points: 10, label: "Duo logos + fourchette", ruleId: "logo_pair_fork" };
  if (has("fork", 1) && has("chef", 1) && has("courier", 1)) return { points: 8, label: "Equipe service complete", ruleId: "service_team" };
  if (has("chef", 1) && has("logo", 2)) return { points: 6, label: "Chef + deux logos TOK", ruleId: "chef_logo_pair" };
  if (has("courier", 1) && has("logo", 2)) return { points: 4, label: "Livreur + deux logos TOK", ruleId: "courier_logo_pair" };

  if (Object.values(counts).some((count) => count === 2)) {
    return { points: 3, label: "Deux symboles identiques", ruleId: "any_pair" };
  }

  return { points: 3, label: "Bonus decouverte TOK", ruleId: "daily_floor" };
}

function formatSpin(row: SlotSpinRow | null | undefined) {
  if (!row) return null;

  return {
    id: row.id,
    spinDate: row.spin_date,
    attemptNumber: row.attempt_number,
    symbols: row.symbols,
    rewardPoints: row.reward_points,
    rewardLabel: row.reward_label,
    createdAt: row.created_at,
  };
}

type SlotStatus = {
  latestSpin: SlotSpinRow | null;
  attemptsUsed: number;
  attemptsRemaining: number;
};

async function getSpinStatus(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  spinDate: string,
): Promise<SlotStatus> {
  const { data, error } = await actor.adminClient
    .from("daily_slot_spins")
    .select("id, spin_date, attempt_number, symbols, reward_points, reward_label, created_at")
    .eq("user_id", actor.userId)
    .eq("spin_date", spinDate)
    .order("attempt_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new HttpError(500, error.message);

  const spins = ((data as SlotSpinRow[] | null) || []);
  const attemptsUsed = spins.length;

  return {
    latestSpin: spins.length ? spins[spins.length - 1] : null,
    attemptsUsed,
    attemptsRemaining: Math.max(SLOT_MAX_ATTEMPTS_PER_DAY - attemptsUsed, 0),
  };
}

function assertClientActor(actor: Awaited<ReturnType<typeof authenticateRequest>>) {
  requireUserRole(actor, ["client"], "Forbidden: client role required");

  const privilegedRoles = new Set(["admin", "restaurateur", "courier"]);
  if (actor.roles.some((role) => privilegedRoles.has(role))) {
    throw new HttpError(403, "Forbidden: client-only reward");
  }
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const spinDate = currentZurichDate();

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    assertClientActor(actor);

    if (req.method === "GET") {
      const status = await getSpinStatus(actor, spinDate);
      return jsonResponse({
        ok: true,
        available: status.attemptsRemaining > 0,
        alreadyClaimed: status.attemptsRemaining <= 0,
        spinDate,
        spin: formatSpin(status.latestSpin),
        attemptsUsed: status.attemptsUsed,
        attemptsRemaining: status.attemptsRemaining,
        maxAttempts: SLOT_MAX_ATTEMPTS_PER_DAY,
      }, 200, cors);
    }

    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    const status = await getSpinStatus(actor, spinDate);
    if (status.attemptsRemaining <= 0) {
      return jsonResponse({
        ok: true,
        available: false,
        alreadyClaimed: true,
        spinDate,
        spin: formatSpin(status.latestSpin),
        attemptsUsed: status.attemptsUsed,
        attemptsRemaining: 0,
        maxAttempts: SLOT_MAX_ATTEMPTS_PER_DAY,
      }, 200, cors);
    }

    const symbols = generateSymbols();
    const reward = scoreSymbols(symbols);
    const rngNonce = crypto.randomUUID();

    const { data, error } = await actor.adminClient.rpc("record_daily_slot_spin", {
      p_user_id: actor.userId,
      p_spin_date: spinDate,
      p_symbols: symbols,
      p_reward_points: reward.points,
      p_reward_label: reward.label,
      p_rng_nonce: rngNonce,
      p_metadata: {
        function_name: FUNCTION_NAME,
        rule_id: reward.ruleId,
        rule_version: SLOT_RULE_VERSION,
        time_zone: SLOT_TIME_ZONE,
        max_attempts_per_day: SLOT_MAX_ATTEMPTS_PER_DAY,
        symbol_weights: SLOT_SYMBOL_WEIGHTS,
      },
    });

    if (error) throw new HttpError(500, error.message);

    const result = (data || {}) as RpcSpinResult;
    const spin = formatSpin(result.spin || null);

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: result.already_claimed ? "already_claimed" : "spin_awarded",
      actor,
      request: req,
      targetEntityType: "daily_slot_spin",
      targetEntityId: spin?.id || null,
      metadata: {
        spin_date: spinDate,
        reward_points: spin?.rewardPoints || reward.points,
        reward_label: spin?.rewardLabel || reward.label,
        already_claimed: Boolean(result.already_claimed),
        attempts_used: result.attempts_used ?? spin?.attemptNumber ?? null,
        attempts_remaining: result.attempts_remaining ?? null,
        max_attempts: result.max_attempts ?? SLOT_MAX_ATTEMPTS_PER_DAY,
      },
    });

    const attemptsRemaining = Math.max(Number(result.attempts_remaining ?? 0), 0);

    return jsonResponse({
      ok: true,
      available: attemptsRemaining > 0,
      alreadyClaimed: Boolean(result.already_claimed),
      spinDate,
      spin,
      attemptsUsed: result.attempts_used ?? spin?.attemptNumber ?? null,
      attemptsRemaining,
      maxAttempts: result.max_attempts ?? SLOT_MAX_ATTEMPTS_PER_DAY,
      totalLoyaltyPoints: result.total_loyalty_points ?? null,
    }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: req.method === "POST" ? "spin_awarded" : "status",
        actor,
        request: req,
        errorMessage: message,
        metadata: { spin_date: spinDate },
      });
    }

    return jsonResponse({ ok: false, error: message }, status, cors);
  }
});
