import {
  authenticateRequest,
  HttpError,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const NAME = "daily-arcade-play";
const ZONE = "Europe/Zurich";
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOYS = new Set(["classic", "basil", "spicy", "thefork", "miamz", "tokball"]);
type Game = "slot" | "plinko" | "claw";
type Attempt = { id: string; request_id: string; game: Game; attempt_number: number; reward_points: number; toy_type: string | null };
type Spin = { reward_points: number };
type Actor = Awaited<ReturnType<typeof authenticateRequest>>;

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function randomInt(maxExclusive: number) {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return bytes[0] % maxExclusive;
}
function assertClient(actor: Actor) {
  requireUserRole(actor, ["client"], "Forbidden: client role required");
  if (actor.roles.some((role) => ["admin", "restaurateur", "courier"].includes(role))) {
    throw new HttpError(403, "Forbidden: client-only reward");
  }
}
async function assignedGame(actor: Actor, playDate: string): Promise<Game> {
  const { data, error } = await actor.adminClient.rpc("get_or_assign_daily_arcade_game", {
    p_user_id: actor.userId, p_play_date: playDate,
  });
  if (error || !["slot", "plinko", "claw"].includes(data)) {
    throw new HttpError(503, "Daily arcade not ready");
  }
  return data as Game;
}
async function getStatus(actor: Actor, playDate: string, game: Game) {
  if (game === "slot") {
    const { data, error } = await actor.adminClient.from("daily_slot_spins")
      .select("reward_points").eq("user_id", actor.userId).eq("spin_date", playDate)
      .order("attempt_number", { ascending: true }).limit(3);
    if (error) throw new HttpError(503, "Daily arcade status unavailable");
    const plays = (data || []) as Spin[];
    return { used: plays.length, reward: plays.reduce((sum, p) => sum + p.reward_points, 0) };
  }
  const { data, error } = await actor.adminClient.from("daily_arcade_attempts")
    .select("reward_points").eq("user_id", actor.userId).eq("play_date", playDate)
    .order("attempt_number", { ascending: true }).limit(3);
  if (error) throw new HttpError(503, "Daily arcade status unavailable");
  const plays = (data || []) as Spin[];
  return { used: plays.length, reward: plays.reduce((sum, p) => sum + p.reward_points, 0) };
}

Deno.serve(async (req: Request) => {
  const headers = { ...buildCorsHeaders(req), "Cache-Control": "private, no-store" };
  const preflight = handleCorsPreflight(req, headers);
  if (preflight) return preflight;
  let actor: Actor | null = null;
  let requestId: string | null = null;
  const playDate = today();
  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    assertClient(actor);
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const game = await assignedGame(actor, playDate);
    if (req.method === "GET") {
      const state = await getStatus(actor, playDate, game);
      return jsonResponse({
        ok: true, game, playDate, timeZone: ZONE,
        attemptsUsed: state.used, attemptsRemaining: Math.max(0, 3 - state.used),
        maxAttempts: 3, sessionRewardPoints: state.reward, available: state.used < 3,
      }, 200, headers);
    }
    if (game === "slot") throw new HttpError(409, "Use the secure daily slot endpoint");
    const provided = req.headers.get("Idempotency-Key")?.trim() || "";
    if (!REQUEST_ID.test(provided)) throw new HttpError(400, "Valid Idempotency-Key required");
    requestId = provided.toLowerCase();
    const raw = await req.text();
    if (raw.length > 1024) throw new HttpError(413, "Request too large");
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      body = parsed as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid JSON");
    }
    if (body.game !== game) throw new HttpError(409, "Different TOK game assigned today");
    const toy = game === "claw" && body.captured === true && typeof body.toyType === "string"
      ? body.toyType : null;
    if (toy !== null && !TOYS.has(toy)) throw new HttpError(400, "Invalid figurine");
    if (game === "claw" && body.captured === true && toy === null) throw new HttpError(400, "Figurine required");
    const reward = game === "claw" ? (toy ? 1 + randomInt(10) : 0) : [1, 3, 5, 7, 10][randomInt(5)];
    const { data, error } = await actor.adminClient.rpc("record_daily_arcade_attempt", {
      p_user_id: actor.userId, p_play_date: playDate, p_game: game,
      p_request_id: requestId, p_toy_type: toy, p_reward_points: reward,
    });
    if (error) throw new HttpError(503, "Daily reward could not be recorded");
    const result = (data || {}) as {
      play?: { id: string; request_id: string; game: Game; reward_points: number; attempt_number: number; toy_type: string | null };
      already_claimed?: boolean; idempotent_replay?: boolean; attempts_used?: number;
      attempts_remaining?: number; session_reward_points?: number; total_loyalty_points?: number;
    };
    if (!result.play) throw new HttpError(503, "Daily result missing");
    await writeAuditLog({
      adminClient: actor.adminClient, functionName: NAME, status: "success",
      action: result.idempotent_replay ? "replay" : result.already_claimed ? "already_claimed" : "arcade_reward",
      actor, request: req, targetEntityType: "daily_arcade_attempt", targetEntityId: result.play.id,
      metadata: { game, play_date: playDate, request_id: requestId, reward_points: result.play.reward_points },
    });
    return jsonResponse({
      ok: true, game, playDate, timeZone: ZONE,
      alreadyClaimed: Boolean(result.already_claimed),
      idempotentReplay: Boolean(result.idempotent_replay),
      play: {
        id: result.play.id, requestId: result.play.request_id, game: result.play.game,
        rewardPoints: result.play.reward_points, attemptNumber: result.play.attempt_number,
        toyType: result.play.toy_type,
      },
      attemptsUsed: result.attempts_used, attemptsRemaining: result.attempts_remaining,
      maxAttempts: 3, sessionRewardPoints: result.session_reward_points,
      totalLoyaltyPoints: result.total_loyalty_points,
    }, 200, headers);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (actor && req.method === "POST") {
      await writeAuditLog({
        adminClient: actor.adminClient, functionName: NAME, status: "failure",
        action: "arcade_reward", actor, request: req, errorMessage: message,
        metadata: { play_date: playDate, request_id: requestId },
      });
    }
    return jsonResponse({ ok: false, error: message }, status, headers);
  }
});
