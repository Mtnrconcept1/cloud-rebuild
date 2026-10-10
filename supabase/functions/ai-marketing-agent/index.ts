import { validatePlan } from "../_shared/marketing-ai-plan.ts";
import { isMarketingTimestamp, normalizeMarketingDestination, normalizeMarketingPurpose, validateMarketingWindow } from "../_shared/marketing-campaign-validation.ts";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { authenticateMarketingRequest } from "../_shared/marketing-service-auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import { asRecord, safeMarketingError } from "../_shared/marketing.ts";
import { OPENAI_API_KEY } from "../_shared/openai.ts";
import { discoverBacklinkSources } from "../_shared/marketing-backlink-discovery.ts";
import {
  MARKETING_CHANNELS,
  generateCampaignVisual,
  generateMarketingPlan,
  slugifyCampaignName,
  toBundlePayload,
} from "../_shared/marketing-ai.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VISUALS = 6;
const MIN_ITEMS = 1;
const MAX_ITEMS = 12;

type Action = "generate" | "list_runs" | "discover_sources";

/**
 * Mirrors the orchestrator: a service-role request may carry the human actor so
 * the audit trail names a person, but the identity is re-checked here and never
 * grants access on its own.
 */
async function attachDelegatedAdminIdentity(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  req: Request,
) {
  if (actor.authMode !== "service_role") return actor;

  const delegatedUserId = req.headers.get("x-marketing-actor-user-id")?.trim() || "";
  if (!delegatedUserId) return actor;
  if (!UUID_PATTERN.test(delegatedUserId)) {
    throw new HttpError(403, "Invalid delegated marketing actor");
  }

  const { data, error } = await actor.adminClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", delegatedUserId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(503, "Delegated administrator check unavailable");
  if (!data) throw new HttpError(403, "Delegated administrator required");

  return {
    ...actor,
    userId: delegatedUserId,
    roles: [...new Set([...actor.roles, "admin"])],
    isAdmin: true,
  };
}

function parseAction(value: unknown): Action {
  const action = typeof value === "string" ? value.trim() : "";
  if (action === "generate" || action === "list_runs" || action === "discover_sources") return action;
  throw new HttpError(400, "invalid_action");
}

function requiredText(value: unknown, field: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new HttpError(400, `${field}_required`);
  if (text.length > max) throw new HttpError(400, `${field}_too_long`);
  return text;
}

function parseIsoDate(value: unknown, field: string) {
  const text = typeof value === "string" ? value.trim() : "";
  const parsed = isMarketingTimestamp(text) ? Date.parse(text) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new HttpError(400, `${field}_invalid`);
  return new Date(parsed).toISOString();
}

/**
 * A channel is proposable only when the marketing schema knows it. Whether it
 * can actually deliver is a separate question, answered by the integration
 * status and enforced by the database, which downgrades an unconnected channel
 * to blocked_configuration rather than letting it look ready.
 */
function parseChannels(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "channels_required");
  }
  if (value.length > 8) throw new HttpError(400, "too_many_channels");
  const known = new Set<string>(MARKETING_CHANNELS);
  const channels = [...new Set(value.map((entry) => String(entry).trim()))];
  for (const channel of channels) {
    if (!known.has(channel)) throw new HttpError(400, "unsupported_channel");
  }
  return channels;
}

async function readConnectedChannels(
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<string[]> {
  const { data, error } = await adminClient
    .from("marketing_integrations")
    .select("channel, status")
    .eq("status", "connected");
  if (error) throw new HttpError(503, "integrations_unavailable");
  return [...new Set((data || []).map((row: { channel: string }) => row.channel))];
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const origin = req.headers.get("origin");
  if (origin === "https://marketing.thetok.ch") {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("ai-marketing-agent");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action: Action | "unknown" = "unknown";
  let runId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateMarketingRequest(req);
    // Same boundary as the orchestrator: a browser token is never enough. The
    // marketing BFF validates the isolated session, MFA and CSRF first, then
    // calls this function with the service credential.
    if (actor.authMode === "user_jwt") {
      throw new HttpError(403, "Marketing service session required");
    }
    actor = await attachDelegatedAdminIdentity(actor, req);
    requireRole(actor, ["admin"]);

    const payload = asRecord(await req.json().catch(() => ({})));
    action = parseAction(payload.action);
    const client = actor.adminClient;

    if (action === "list_runs") {
      const { data, error } = await client.rpc("service_list_marketing_ai_runs", { p_limit: 20 });
      if (error) throw new HttpError(503, "runs_unavailable");
      return jsonResponse({ ok: true, ...asRecord(data) }, 200, corsHeaders);
    }

    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    if (action === "discover_sources") {
      const result = await discoverBacklinkSources(payload.query, payload.limit, payload.withoutAccountOnly);
      await writeAuditLog({
        adminClient: client, actor, request: req, functionName: "ai-marketing-agent",
        action, status: "success", metadata: { source_count: result.sources.length },
      });
      return jsonResponse({ ok: true, ...result }, 200, corsHeaders);
    }

    const objective = requiredText(payload.objective, "objective", 2000);
    const audienceHint = typeof payload.audienceHint === "string"
      ? payload.audienceHint.trim().slice(0, 500)
      : "";
    const channels = parseChannels(payload.channels);
    const startsAt = parseIsoDate(payload.startsAt, "startsAt");
    const endsAt = parseIsoDate(payload.endsAt, "endsAt");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new HttpError(400, "window_invalid");
    }
    const rawCount = Number(payload.itemCount ?? 4);
    if (!Number.isInteger(rawCount) || rawCount < MIN_ITEMS || rawCount > MAX_ITEMS) {
      throw new HttpError(400, "item_count_invalid");
    }

    try { validateMarketingWindow(startsAt, endsAt); }
    catch { throw new HttpError(400, "campaign_schedule_invalid"); }
    let destinationUrl: string;
    let purpose: ReturnType<typeof normalizeMarketingPurpose>;
    try { destinationUrl = normalizeMarketingDestination(payload.destinationUrl); purpose = normalizeMarketingPurpose(payload.purpose); }
    catch { throw new HttpError(400, "campaign_destination_invalid"); }
    if (rawCount < channels.length || (purpose === "acquisition" && channels.some((channel) => ["in_app", "push"].includes(channel)))) throw new HttpError(400, "campaign_channels_invalid");
    const generationDeadline = Date.now() + 85_000;
    const connectedChannels = await readConnectedChannels(client);

    const { data: startedRunId, error: startError } = await client.rpc(
      "service_start_marketing_ai_run",
      {
        p_actor_user_id: actor.userId,
        p_objective: objective,
        p_channels: channels,
      },
    );
    if (startError) throw new HttpError(503, "run_start_unavailable");
    runId = typeof startedRunId === "string" ? startedRunId : null;

    const { plan, model, usage, estimatedCostChf } = await generateMarketingPlan({
      objective,
      allowedChannels: channels,
      connectedChannels,
      audienceHint,
      startsAt,
      endsAt,
      itemCount: rawCount,
      locale: "fr-CH",
      destinationUrl,
      purpose,
    });

    // Visuals are generated after the plan and never block it: a failed image
    // leaves the item without one instead of discarding a usable campaign.
    const visuals = new Map<number, string>();
    const slug = slugifyCampaignName(plan.campaign.name);
    const candidates = plan.items.map((item, index) => ({ item, index }))
      .filter(({ item }) => item.visual_prompt).slice(0, MAX_VISUALS);
    // Two workers, one request budget: never issue an unbounded image series.
    let nextVisual = 0;
    const renderVisuals = async () => {
      while (nextVisual < candidates.length && Date.now() < generationDeadline) {
        const candidate = candidates[nextVisual++];
        const url = await generateCampaignVisual(client, {
          prompt: candidate.item.visual_prompt!, campaignSlug: slug, index: candidate.index,
          apiKey: OPENAI_API_KEY, timeoutMs: Math.max(1, generationDeadline - Date.now()),
        });
        if (url) visuals.set(candidate.index, url);
      }
    };
    await Promise.all([renderVisuals(), renderVisuals()]);
    validatePlan(plan, channels, { now: Date.now(), startsAt, endsAt, itemCount: rawCount, destinationUrl, purpose });

    const bundle = toBundlePayload(plan, visuals, { destinationUrl, purpose });

    await writeAuditLog({
      adminClient: client,
      actor,
      request: req,
      functionName: "ai-marketing-agent",
      action: "generate",
      status: "success",
      targetEntityType: "marketing_ai_runs",
      targetEntityId: runId,
      metadata: {
        item_count: plan.items.length,
        asset_count: visuals.size,
        channels,
        model,
      },
    });

    return jsonResponse(
      {
        ok: true,
        runId,
        bundle,
        summary: plan.campaign.summary,
        itemCount: plan.items.length,
        assetCount: visuals.size,
        model,
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        estimatedCostChf,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    const message = safeMarketingError(error);
    const status = error instanceof HttpError ? error.status : 500;
    log.error("agent_failed", { message, action, status });

    if (runId) {
      try {
        await (actor?.adminClient || createAdminClient()).rpc("service_complete_marketing_ai_run", {
          p_run_id: runId,
          p_status: "failed",
          p_plan: null,
          p_campaign_id: null,
          p_item_count: 0,
          p_asset_count: 0,
          p_model: "",
          p_input_tokens: 0,
          p_output_tokens: 0,
          p_estimated_cost_chf: 0,
          p_error: message,
        });
      } catch {
        // The run stays 'running' and is visible as such; losing the marker
        // must never mask the original failure.
      }
    }

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "ai-marketing-agent",
      action: action === "unknown" ? "generate" : action,
      status: "failure",
      targetEntityType: "marketing_ai_runs",
      targetEntityId: runId,
      errorMessage: message,
    });

    if (error instanceof HttpError) return jsonResponse({ error: message }, error.status, corsHeaders);
    return jsonResponse({ error: "Erreur interne de l’agent marketing" }, 500, corsHeaders);
  }
});
