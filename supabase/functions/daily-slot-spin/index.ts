import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  SLOT_MAX_ATTEMPTS_PER_DAY,
  SLOT_RULE_VERSION,
  SLOT_SYMBOL_WEIGHTS,
  SLOT_TIME_ZONE,
  generateSlotSymbols,
  scoreSlotSymbols,
  type SlotSymbolId,
} from "./rules.ts";

const FUNCTION_NAME = "daily-slot-spin";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SlotSpinRow = {
  id: string;
  request_id: string | null;
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
  idempotent_replay?: boolean;
  spin?: SlotSpinRow | null;
  total_loyalty_points?: number | null;
  attempts_used?: number | null;
  attempts_remaining?: number | null;
  max_attempts?: number | null;
};

type SlotStatus = {
  latestSpin: SlotSpinRow | null;
  attemptsUsed: number;
  attemptsRemaining: number;
};

function currentZurichDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SLOT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readRequestId(req: Request) {
  const provided = req.headers.get("Idempotency-Key")?.trim();

  if (!provided) return crypto.randomUUID();
  if (!UUID_PATTERN.test(provided)) {
    throw new HttpError(400, "Invalid Idempotency-Key");
  }

  return provided.toLowerCase();
}

function formatSpin(row: SlotSpinRow | null | undefined) {
  if (!row) return null;

  return {
    id: row.id,
    requestId: row.request_id,
    spinDate: row.spin_date,
    attemptNumber: row.attempt_number,
    symbols: row.symbols,
    rewardPoints: row.reward_points,
    rewardLabel: row.reward_label,
    createdAt: row.created_at,
  };
}

async function getSpinStatus(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  spinDate: string,
): Promise<SlotStatus> {
  const { data, error } = await actor.adminClient
    .from("daily_slot_spins")
    .select("id, request_id, spin_date, attempt_number, symbols, reward_points, reward_label, created_at")
    .eq("user_id", actor.userId)
    .eq("spin_date", spinDate)
    .order("attempt_number", { ascending: false })
    .limit(SLOT_MAX_ATTEMPTS_PER_DAY);

  if (error) throw new HttpError(500, error.message);

  const spins = ((data as SlotSpinRow[] | null) || []);
  const attemptsUsed = spins.length;

  return {
    latestSpin: spins[0] || null,
    attemptsUsed,
    attemptsRemaining: Math.max(
      SLOT_MAX_ATTEMPTS_PER_DAY - attemptsUsed,
      0,
    ),
  };
}

function assertClientActor(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
) {
  requireUserRole(actor, ["client"], "Forbidden: client role required");

  const privilegedRoles = new Set(["admin", "restaurateur", "courier"]);
  if (actor.roles.some((role) => privilegedRoles.has(role))) {
    throw new HttpError(403, "Forbidden: client-only reward");
  }
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const responseHeaders = {
    ...cors,
    "Cache-Control": "private, no-store",
  };
  const preflight = handleCorsPreflight(req, responseHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const spinDate = currentZurichDate();
  let requestId: string | null = null;

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
        ruleVersion: SLOT_RULE_VERSION,
        timeZone: SLOT_TIME_ZONE,
      }, 200, responseHeaders);
    }

    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    requestId = readRequestId(req);
    const symbols = generateSlotSymbols();
    const reward = scoreSlotSymbols(symbols);
    const rngNonce = crypto.randomUUID();

    // The RPC owns the attempt-limit and idempotency checks under one database
    // advisory lock. Avoiding a preflight status query removes one round-trip
    // and leaves a single source of truth for concurrent browser tabs.
    const { data, error } = await actor.adminClient.rpc("record_daily_slot_spin", {
      p_user_id: actor.userId,
      p_spin_date: spinDate,
      p_symbols: symbols,
      p_reward_points: reward.points,
      p_reward_label: reward.label,
      p_rng_nonce: rngNonce,
      p_metadata: {
        function_name: FUNCTION_NAME,
        request_id: requestId,
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
    if (!spin) throw new HttpError(500, "Slot result unavailable");

    const attemptsRemaining = Math.max(
      Number(result.attempts_remaining ?? 0),
      0,
    );
    const idempotentReplay = Boolean(result.idempotent_replay);
    const alreadyClaimed = Boolean(result.already_claimed);

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: alreadyClaimed
        ? "already_claimed"
        : idempotentReplay
          ? "spin_replayed"
          : "spin_awarded",
      actor,
      request: req,
      targetEntityType: "daily_slot_spin",
      targetEntityId: spin.id,
      metadata: {
        request_id: requestId,
        spin_date: spinDate,
        reward_points: spin.rewardPoints,
        reward_label: spin.rewardLabel,
        already_claimed: alreadyClaimed,
        idempotent_replay: idempotentReplay,
        attempts_used: result.attempts_used ?? spin.attemptNumber,
        attempts_remaining: attemptsRemaining,
        max_attempts: result.max_attempts ?? SLOT_MAX_ATTEMPTS_PER_DAY,
      },
    });

    return jsonResponse({
      ok: true,
      available: attemptsRemaining > 0,
      alreadyClaimed,
      idempotentReplay,
      spinDate,
      spin,
      attemptsUsed: result.attempts_used ?? spin.attemptNumber,
      attemptsRemaining,
      maxAttempts: result.max_attempts ?? SLOT_MAX_ATTEMPTS_PER_DAY,
      totalLoyaltyPoints: result.total_loyalty_points ?? null,
      ruleVersion: SLOT_RULE_VERSION,
      timeZone: SLOT_TIME_ZONE,
    }, 200, responseHeaders);
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
        metadata: {
          request_id: requestId,
          spin_date: spinDate,
        },
      });
    }

    return jsonResponse(
      { ok: false, error: message },
      status,
      responseHeaders,
    );
  }
});

