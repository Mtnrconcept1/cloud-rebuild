import { allocateMarketingVisuals } from "../_shared/marketing-visual-allocation.ts";
import { MAILING_FIELDS, MailingInputError, mailingScheduleOptions, parseMailingOptions, type MailingField, type MailingFacetPage } from "../_shared/marketing-mailing.ts";
import { interpretMailingBrief } from "../_shared/marketing-mailing-plan.ts";
import { buildCampaignSlots, CampaignOptionsError, parseCampaignOptions } from "../_shared/marketing-campaign-options.ts";
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
  type MarketingChannel,
  type MarketingPostFormat,
} from "../_shared/marketing-ai.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VISUALS = 6;
const MIN_ITEMS = 1;
const MAX_ITEMS = 12;

type Action = "generate" | "list_runs" | "discover_sources" | "interpret_mailing";

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
  if (action === "generate" || action === "list_runs" || action === "discover_sources" || action === "interpret_mailing") return action;
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
  const parsed = Date.parse(text);
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

function parseFormats(value: unknown, channels: readonly string[]) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "formats_invalid");
  const record = asRecord(value);
  const allowedFormats = new Set(["1:1", "9:16", "16:9"]);
  const allowedChannels = new Set(channels);
  const formats: Partial<Record<MarketingChannel, MarketingPostFormat>> = {};
  for (const [channel, format] of Object.entries(record)) {
    if (!allowedChannels.has(channel) || typeof format !== "string" || !allowedFormats.has(format)) {
      throw new HttpError(400, "formats_invalid");
    }
    formats[channel as MarketingChannel] = format as MarketingPostFormat;
  }
  return formats;
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
  const generationDeadline = Date.now() + 110_000;
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

    if (action === "interpret_mailing") {
      const prompt = requiredText(payload.prompt, "prompt", 2000);
      const entries = await Promise.all((Object.keys(MAILING_FIELDS) as MailingField[]).map(async (field) => {
        const { data, error } = await client.rpc("service_marketing_mailing_facets", { p_field: field, p_limit: 200 });
        if (error) throw new HttpError(503, "mailing_facets_unavailable");
        return [field, data as MailingFacetPage] as const;
      }));
      const result = await interpretMailingBrief(prompt, Object.fromEntries(entries) as Record<MailingField, MailingFacetPage>);
      await writeAuditLog({ adminClient: client, actor, request: req, functionName: "ai-marketing-agent", action, status: "success", metadata: { unresolved_count: result.unresolved.length } });
      return jsonResponse({ ok: true, ...result }, 200, corsHeaders);
    }

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
    const formats = parseFormats(payload.formats, channels);
    const startsAt = parseIsoDate(payload.startsAt, "startsAt");
    const endsAt = parseIsoDate(payload.endsAt, "endsAt");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new HttpError(400, "window_invalid");
    }
    const rawCount = Number(payload.itemCount ?? 4);
    if (!Number.isInteger(rawCount) || rawCount < MIN_ITEMS || rawCount > MAX_ITEMS) {
      throw new HttpError(400, "item_count_invalid");
    }
    const campaignOptions = parseCampaignOptions(payload.campaignOptions, channels);
    const mailingOptions = parseMailingOptions(payload.mailingOptions);
    if (mailingOptions && (campaignOptions || channels.length !== 1 || channels[0] !== "email" || rawCount !== mailingOptions.emailCount ||
      Date.parse(startsAt) <= Date.now() || buildCampaignSlots(mailingScheduleOptions(mailingOptions), ["email"], startsAt).some((slot) => Date.parse(slot.scheduledAt) > Date.parse(endsAt)))) {
      throw new MailingInputError("Cible, période ou nombre d’e-mails invalide.");
    }
    if (campaignOptions) {
      if (Date.parse(startsAt) <= Date.now()) throw new HttpError(400, "campaign_start_must_be_future");
      if (campaignOptions.postCount !== rawCount) throw new HttpError(400, "campaign_post_count_mismatch");
      const slots = buildCampaignSlots(campaignOptions, channels, startsAt);
      if (slots.some((slot) => Date.parse(slot.scheduledAt) > Date.parse(endsAt))) {
        throw new HttpError(400, "campaign_window_too_short");
      }
    }

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
      campaignOptions,
      mailingOptions,
      formats,
    });

    // Visuals are generated after the plan and never block it: a failed image
    // leaves the item without one instead of discarding a usable campaign.
    const slug = slugifyCampaignName(plan.campaign.name);
    const visualRequests = plan.items.map((item) => ({
      visual_prompt: item.visual_prompt,
      visual_format: item.visual_format || formats[item.channel],
    }));
    const visuals = await allocateMarketingVisuals(visualRequests, (prompt, index) => generateCampaignVisual(client, {
      prompt, campaignSlug: slug, index, apiKey: OPENAI_API_KEY,
      format: visualRequests[index].visual_format,
      timeoutMs: Math.max(1, generationDeadline - Date.now()),
    }), MAX_VISUALS);
    const assetCount = new Set(visuals.values()).size;
    const missingVisualCount = plan.items.filter((item, index) =>
      (item.channel === "instagram" || item.channel === "facebook" || Boolean(item.visual_prompt)) && !visuals.has(index)).length;

    const bundle = toBundlePayload(plan, visuals, formats);

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
        asset_count: assetCount,
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
        assetCount,
        missingVisualCount,
        warnings: missingVisualCount > 0 ? ["visual_generation_incomplete"] : [],
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
    const status = error instanceof CampaignOptionsError || error instanceof MailingInputError ? 400 : error instanceof HttpError ? error.status : 500;
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
    if (error instanceof CampaignOptionsError) return jsonResponse({ error: error.reason }, 400, corsHeaders);
    if (error instanceof MailingInputError) return jsonResponse({ error: error.message }, 400, corsHeaders);
    return jsonResponse({ error: "Erreur interne de l’agent marketing" }, 500, corsHeaders);
  }
});
