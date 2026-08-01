import { addDays, subDays } from "date-fns";

import { getSupabase } from "@/integrations/supabase/client";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { marketingZurichDateBoundaryToIso } from "@/marketing/zurichTime";
import type {
  CursorPage,
  MarketingAudienceEstimate,
  MarketingAutomation,
  MarketingAutomationDraft,
  MarketingCalendarItem,
  MarketingCampaign,
  MarketingCampaignDraft,
  MarketingChannel,
  MarketingChannelId,
  MarketingContactType,
  MarketingDelivery,
  MarketingIntegration,
  MarketingOverview,
  MarketingProspect,
  MarketingAudience,
  MarketingResultPoint,
  MarketingSnapshot,
} from "@/marketing/types";

type UnknownRecord = Record<string, unknown>;
type RpcResponse = { data: unknown; error: unknown };
type RpcInvoker = (name: string, args: UnknownRecord) => PromiseLike<RpcResponse>;

const supabase = getSupabase();

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAvailability(
  value: unknown,
  fallback: MarketingChannel["availability"],
): MarketingChannel["availability"] {
  const status = asString(value, fallback).toLowerCase();
  if (["connected", "available", "ready"].includes(status)) return "available";
  if (status === "manual") return "manual";
  if (["disconnected", "not_connected"].includes(status)) return "disconnected";
  return "blocked_configuration";
}

function pick(record: UnknownRecord, ...keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function contentMessage(value: unknown) {
  if (typeof value === "string") return value;
  return asString(pick(asRecord(value), "message", "body", "text"));
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : asString(asRecord(error).message, "Service indisponible");
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

async function invokeRpc<T>(name: string, args: UnknownRecord): Promise<T> {
  const invoke = supabase.rpc as unknown as RpcInvoker;
  const { data, error } = await invoke(name, args);
  if (error) throw error;
  return data as T;
}

function normalizeCampaign(value: unknown, fallback?: MarketingCampaign): MarketingCampaign {
  const row = asRecord(value);
  return {
    id: asString(pick(row, "id"), fallback?.id || crypto.randomUUID()),
    name: asString(pick(row, "name", "title"), fallback?.name || "Campagne sans titre"),
    objective: asString(pick(row, "objective", "description"), fallback?.objective || ""),
    status: asString(pick(row, "status"), fallback?.status || "draft") as MarketingCampaign["status"],
    audienceId: asString(pick(row, "audience_id", "audienceId"), fallback?.audienceId || ""),
    audienceName: asString(pick(row, "audience_name", "audienceName"), fallback?.audienceName || "Audience à définir"),
    channels: asArray(pick(row, "channels")).map(String) as MarketingChannelId[],
    startsAt: asString(pick(row, "starts_at", "startsAt"), fallback?.startsAt || "") || null,
    endsAt: asString(pick(row, "ends_at", "endsAt"), fallback?.endsAt || "") || null,
    sent: asNumber(pick(row, "sent", "sent_count"), fallback?.sent || 0),
    delivered: asNumber(pick(row, "delivered", "delivered_count"), fallback?.delivered || 0),
    clicked: asNumber(pick(row, "clicked", "click_count"), fallback?.clicked || 0),
    conversions: asNumber(pick(row, "conversions", "conversion_count"), fallback?.conversions || 0),
    requiresApproval: asBoolean(pick(row, "requires_approval", "requiresApproval"), fallback?.requiresApproval ?? true),
    content: contentMessage(pick(row, "content", "message")) || fallback?.content || "",
    approvedAt: asString(pick(row, "approved_at", "approvedAt"), fallback?.approvedAt || "") || null,
    updatedAt: asString(pick(row, "updated_at", "updatedAt"), fallback?.updatedAt || new Date().toISOString()),
  };
}

function normalizeCalendarItem(value: unknown, fallback?: MarketingCalendarItem): MarketingCalendarItem {
  const row = asRecord(value);
  const manualOutcomeValue = asString(pick(row, "manual_outcome", "manualOutcome"));
  return {
    id: asString(pick(row, "id"), fallback?.id || crypto.randomUUID()),
    campaignId: asString(pick(row, "campaign_id", "campaignId"), fallback?.campaignId || "") || null,
    campaignName: asString(pick(row, "campaign_name", "campaignName"), fallback?.campaignName || "Campagne"),
    title: asString(pick(row, "title", "name"), fallback?.title || "Publication"),
    channel: asString(pick(row, "channel"), fallback?.channel || "in_app") as MarketingChannelId,
    status: asString(pick(row, "status"), fallback?.status || "draft") as MarketingCalendarItem["status"],
    scheduledAt: asString(pick(row, "scheduled_at", "scheduledAt"), fallback?.scheduledAt || new Date().toISOString()),
    timezone: asString(pick(row, "timezone"), fallback?.timezone || "Europe/Zurich"),
    audienceName: asString(pick(row, "audience_name", "audienceName"), fallback?.audienceName || "Audience"),
    audienceSize: asNumber(pick(row, "audience_size", "audienceSize"), fallback?.audienceSize || 0),
    approvalStatus: asString(pick(row, "approval_status", "approvalStatus"), fallback?.approvalStatus || "pending") as MarketingCalendarItem["approvalStatus"],
    content: contentMessage(pick(row, "content", "message")) || fallback?.content || "",
    manualOutcome: ["published", "failed"].includes(manualOutcomeValue)
      ? manualOutcomeValue as MarketingCalendarItem["manualOutcome"]
      : fallback?.manualOutcome || null,
    manualNote: (asString(pick(row, "manual_note", "manualNote"), fallback?.manualNote || "").slice(0, 2_000) || null),
    publishedAt: asString(pick(row, "published_at", "publishedAt"), fallback?.publishedAt || "") || null,
    updatedAt: asString(pick(row, "updated_at", "updatedAt"), fallback?.updatedAt || new Date().toISOString()),
  };
}

function normalizeDelivery(value: unknown, fallback?: MarketingDelivery): MarketingDelivery {
  const row = asRecord(value);
  const manualOutcomeValue = asString(pick(row, "manual_outcome", "manualOutcome"));
  return {
    id: asString(pick(row, "id"), fallback?.id || crypto.randomUUID()),
    itemId: asString(pick(row, "item_id", "calendar_item_id", "itemId"), fallback?.itemId || ""),
    campaignName: asString(pick(row, "campaign_name", "campaignName"), fallback?.campaignName || "Campagne"),
    // The API contract intentionally exposes only a masked target.
    targetMasked: asString(pick(row, "target_masked", "targetMasked"), fallback?.targetMasked || "***"),
    channel: asString(pick(row, "channel"), fallback?.channel || "in_app") as MarketingChannelId,
    status: asString(pick(row, "status"), fallback?.status || "queued") as MarketingDelivery["status"],
    provider: asString(pick(row, "provider"), fallback?.provider || "TOK"),
    attempt: asNumber(pick(row, "attempt", "attempt_count"), fallback?.attempt || 1),
    scheduledAt: asString(pick(row, "scheduled_at", "scheduledAt"), fallback?.scheduledAt || "") || null,
    sentAt: asString(pick(row, "sent_at", "sentAt"), fallback?.sentAt || "") || null,
    manualOutcome: ["completed", "failed"].includes(manualOutcomeValue)
      ? manualOutcomeValue as MarketingDelivery["manualOutcome"]
      : fallback?.manualOutcome || null,
    manualNote: (asString(pick(row, "manual_note", "manualNote"), fallback?.manualNote || "").slice(0, 2_000) || null),
    createdAt: asString(pick(row, "created_at", "createdAt"), fallback?.createdAt || new Date().toISOString()),
    updatedAt: asString(pick(row, "updated_at", "updatedAt"), fallback?.updatedAt || new Date().toISOString()),
    errorCode: asString(pick(row, "error_code", "errorCode"), fallback?.errorCode || "") || null,
  };
}

function normalizeOverview(value: unknown, fallback: MarketingOverview) {
  const row = asRecord(value);
  const totals = asRecord(pick(row, "totals", "metrics"));
  return {
    globalPaused: asBoolean(pick(row, "global_paused", "globalPaused"), fallback.globalPaused),
    globalPauseReason: asString(pick(row, "global_pause_reason", "globalPauseReason"), fallback.globalPauseReason || "") || null,
    freeOnly: asBoolean(pick(row, "free_only", "freeOnly"), true),
    approvalRequired: asBoolean(pick(row, "approval_required", "approvalRequired"), true),
    schedulerReady: asBoolean(pick(row, "scheduler_ready", "schedulerReady"), false),
    scheduledCount: asNumber(pick(row, "scheduled_count", "scheduledCount"), fallback.scheduledCount),
    eligibleContacts: asNumber(pick(row, "eligible_contacts", "eligibleContacts"), fallback.eligibleContacts),
    sent: asNumber(pick(totals, "sent", "sent_count") ?? pick(row, "sent"), fallback.sent),
    delivered: asNumber(pick(totals, "delivered", "delivered_count") ?? pick(row, "delivered"), fallback.delivered),
    clicked: asNumber(pick(totals, "clicked", "clicks") ?? pick(row, "clicked"), fallback.clicked),
    conversions: asNumber(pick(totals, "conversions") ?? pick(row, "conversions"), fallback.conversions),
    deliveryRate: asNumber(pick(row, "delivery_rate", "deliveryRate"), fallback.deliveryRate),
    clickRate: asNumber(pick(row, "click_rate", "clickRate"), fallback.clickRate),
    conversionRate: asNumber(pick(row, "conversion_rate", "conversionRate"), fallback.conversionRate),
    updatedAt: asString(pick(row, "updated_at", "updatedAt"), new Date().toISOString()),
  } satisfies MarketingOverview;
}

function normalizeCursorPage<T>(
  value: unknown,
  normalizer: (item: unknown) => T,
): CursorPage<T> {
  const row = asRecord(value);
  const next = pick(row, "next_cursor", "nextCursor");
  return {
    items: asArray(pick(row, "items", "data")).map(normalizer),
    nextCursor: next ? Object.fromEntries(
      Object.entries(asRecord(next)).map(([key, item]) => [key, String(item)]),
    ) : null,
  };
}

function normalizeChannels(value: unknown, fallback: MarketingChannel[]) {
  const incoming = asArray(value);
  if (!incoming.length) return fallback;
  const normalized = incoming.map((item) => {
    const row = asRecord(item);
    const id = asString(pick(row, "id", "channel"), "in_app") as MarketingChannelId;
    const existing = fallback.find((channel) => channel.id === id);
    return {
      id,
      label: asString(pick(row, "label", "name"), existing?.label || id),
      availability: normalizeAvailability(pick(row, "availability", "status"), existing?.availability || "blocked_configuration"),
      reason: asString(pick(row, "reason", "message"), existing?.reason || "État non confirmé"),
      costModel: asString(pick(row, "cost_model", "costModel"), existing?.costModel || "free") as MarketingChannel["costModel"],
      lastCheckedAt: asString(pick(row, "last_checked_at", "lastCheckedAt"), new Date().toISOString()),
    };
  });
  return [
    ...fallback.map((channel) => normalized.find((item) => item.id === channel.id) || channel),
    ...normalized.filter((item) => !fallback.some((channel) => channel.id === item.id)),
  ];
}

function normalizeResults(value: unknown, fallback: MarketingResultPoint[]) {
  const incoming = asArray(value);
  if (!incoming.length) return fallback;
  return incoming.map((item) => {
    const row = asRecord(item);
    return {
      date: asString(pick(row, "date", "day")),
      sent: asNumber(pick(row, "sent", "sent_count")),
      delivered: asNumber(pick(row, "delivered", "delivered_count")),
      clicks: asNumber(pick(row, "clicks", "clicked")),
      conversions: asNumber(pick(row, "conversions")),
    };
  });
}

function normalizeAutomation(value: unknown): MarketingAutomation {
  const row = asRecord(value);
  const isSystem = asBoolean(pick(row, "is_system", "isSystem"));
  const engineConnected = isSystem || asBoolean(pick(row, "engine_connected", "engineConnected"));
  const rawStatus = asString(pick(row, "status"), "paused") as MarketingAutomation["status"];
  return {
    id: asString(pick(row, "id"), crypto.randomUUID()),
    name: asString(pick(row, "name"), "Automatisation sans titre"),
    description: asString(pick(row, "description")),
    trigger: asString(pick(row, "trigger", "trigger_type"), "Déclencheur à définir"),
    action: asString(pick(row, "action", "action_type"), "Action à définir"),
    channel: asString(pick(row, "channel"), "in_app") as MarketingChannelId,
    status: rawStatus === "active" && !engineConnected ? "paused" : rawStatus,
    runs: asNumber(pick(row, "runs", "run_count")),
    errors: asNumber(pick(row, "errors", "error_count")),
    lastRunAt: asString(pick(row, "last_run_at", "lastRunAt")) || null,
    nextRunAt: asString(pick(row, "next_run_at", "nextRunAt")) || null,
    updatedAt: asString(pick(row, "updated_at", "updatedAt"), new Date().toISOString()),
    isSystem,
    engineConnected,
  };
}

function normalizeIntegration(value: unknown, fallback: MarketingIntegration[]): MarketingIntegration {
  const row = asRecord(value);
  const channel = asString(pick(row, "channel"), "in_app") as MarketingChannelId;
  const existing = fallback.find((item) => item.channel === channel);
  return {
    id: asString(pick(row, "id"), existing?.id || `integration-${channel}`),
    name: asString(pick(row, "name", "provider"), existing?.name || channel),
    channel,
    status: normalizeAvailability(pick(row, "status", "availability"), existing?.status || "blocked_configuration"),
    description: asString(pick(row, "description", "status_reason"), existing?.description || "État non confirmé"),
    configuredAt: asString(pick(row, "configured_at", "configuredAt"), existing?.configuredAt || "") || null,
    lastCheckedAt: asString(pick(row, "last_checked_at", "lastCheckedAt"), new Date().toISOString()),
    actionLabel: asString(pick(row, "action_label", "actionLabel"), existing?.actionLabel || "Vérifier"),
  };
}

function normalizeProspect(value: unknown): MarketingProspect {
  const row = asRecord(value);
  const emailMasked = asString(pick(row, "email_masked", "emailMasked")) || null;
  const phoneMasked = asString(pick(row, "phone_masked", "phoneMasked")) || null;
  const contactability = asString(pick(row, "contactability"), "manual_research") as MarketingProspect["contactability"];
  const contactType = asString(pick(row, "contact_type", "contactType"), "manual") as MarketingContactType;
  const lawfulBasis = asString(pick(row, "lawful_basis", "lawfulBasis")) || null;
  return {
    id: asString(pick(row, "id"), crypto.randomUUID()),
    contactType,
    displayName: asString(pick(row, "display_name", "displayName"), "Prospect masqué"),
    city: asString(pick(row, "city")),
    canton: asString(pick(row, "canton"), "CH"),
    category: asString(pick(row, "category"), "Restaurant"),
    status: asString(pick(row, "status"), "new") as MarketingProspect["status"],
    leadScore: asNumber(pick(row, "lead_score", "leadScore")),
    recommendedChannel: contactability === "opted_out"
      ? "manual_visit"
      : contactType === "registered_user" && ["consent", "existing_customer"].includes(lawfulBasis || "")
        ? "in_app"
      : phoneMasked
        ? "manual_call"
        : emailMasked
          ? "manual_email"
          : "manual_visit",
    contactability,
    lastContactAt: asString(pick(row, "last_contact_at", "lastContactAt")) || null,
    nextActionAt: asString(pick(row, "next_action_at", "nextActionAt")) || null,
    tags: [
      asString(pick(row, "canton")),
      lawfulBasis || "",
    ].filter(Boolean),
    emailMasked,
    phoneMasked,
    lawfulBasis,
    updatedAt: asString(pick(row, "updated_at", "updatedAt"), new Date().toISOString()),
  };
}

function computeAudiencesFromProspects(prospects: MarketingProspect[]): MarketingAudience[] {
  const groups = new Map<string, {
    kind: MarketingAudience["kind"];
    canton: string;
    items: MarketingProspect[];
  }>();
  for (const prospect of prospects) {
    const canton = prospect.canton || "CH";
    const kind = prospect.contactType === "registered_user"
      ? "client"
      : prospect.contactType === "manual"
        ? "mixed"
        : "restaurant";
    const key = `${kind}:${canton}`;
    const group = groups.get(key) || { kind, canton, items: [] };
    groups.set(key, { ...group, items: [...group.items, prospect] });
  }
  return Array.from(groups.values())
    .map(({ kind, canton, items }) => {
      const activeItems = items.filter((item) => item.contactability === "ready" && item.status !== "opted_out");
      const phoneReady = activeItems.filter((item) => (
        item.phoneMasked
        && ["consent", "existing_customer", "legitimate_interest"].includes(item.lawfulBasis || "")
      )).length;
      const emailReady = activeItems.filter((item) => (
        item.emailMasked
        && ["consent", "existing_customer"].includes(item.lawfulBasis || "")
      )).length;
      const inAppReady = kind === "client"
        ? activeItems.filter((item) => ["consent", "existing_customer"].includes(item.lawfulBasis || "")).length
        : 0;
      return {
        id: `computed:${kind}:${canton}`,
        name: `Aperçu calculé · ${kind === "restaurant" ? "Restaurants" : kind === "client" ? "Clients" : "Contacts manuels"} · ${canton}`,
        kind,
        location: canton,
        total: items.length,
        // A masked first page is insufficient to make a legal eligibility or
        // consent claim. Those values exist only after the governed estimate RPC.
        eligible: null,
        consentCoverage: null,
        recommendedChannel: inAppReady > 0
          ? "in_app" as const
          : emailReady > phoneReady
            ? "manual_email" as const
            : phoneReady > 0
              ? "manual_call" as const
              : "manual_visit" as const,
        updatedAt:
          items.map((item) => item.updatedAt).sort()[items.length - 1] || new Date().toISOString(),
        computed: true,
        sampleLimited: true,
      };
    })
    .sort((left, right) => right.total - left.total);
}

export async function loadMarketingSnapshot(options: {
  calendarFrom?: string;
  calendarTo?: string;
} = {}): Promise<MarketingSnapshot> {
  const fallback = createFallbackMarketingSnapshot();
  const now = new Date();
  const from = subDays(now, 30).toISOString();
  const to = addDays(now, 60).toISOString();
  const calendarFrom = options.calendarFrom
    ? marketingZurichDateBoundaryToIso(options.calendarFrom, "start") || from
    : from;
  const calendarTo = options.calendarTo
    ? marketingZurichDateBoundaryToIso(options.calendarTo, "end") || to
    : to;
  const warnings: string[] = [];
  let successfulReads = 0;

  const [
    overviewResult,
    campaignsResult,
    calendarResult,
    deliveriesResult,
    automationsResult,
    integrationsResult,
    contactsResult,
  ] = await Promise.allSettled([
    invokeRpc<unknown>("admin_get_marketing_overview", { p_from: from, p_to: to }),
    invokeRpc<unknown>("admin_list_marketing_campaigns", {
      p_status: null,
      p_limit: 100,
      p_cursor_updated_at: null,
      p_cursor_id: null,
    }),
    invokeRpc<unknown>("admin_list_marketing_calendar", {
      p_from: calendarFrom,
      p_to: calendarTo,
      p_status: null,
      p_channel: null,
      p_limit: 200,
      p_cursor_scheduled_at: null,
      p_cursor_id: null,
    }),
    invokeRpc<unknown>("admin_list_marketing_deliveries", {
      p_item_id: null,
      p_status: null,
      p_channel: null,
      p_limit: 200,
      p_cursor_created_at: null,
      p_cursor_id: null,
    }),
    invokeRpc<unknown>("admin_list_marketing_automations", {
      p_status: null,
      p_limit: 100,
      p_cursor_updated_at: null,
      p_cursor_id: null,
    }),
    invokeRpc<unknown>("admin_list_marketing_integrations", {
      p_channel: null,
      p_limit: 100,
      p_cursor_id: null,
    }),
    invokeRpc<unknown>("admin_list_marketing_contacts", {
      p_status: null,
      p_canton: null,
      p_limit: 100,
      p_cursor_updated_at: null,
      p_cursor_id: null,
    }),
  ]);

  let overview = fallback.overview;
  let channels = fallback.channels;
  let campaigns = fallback.campaigns;
  let calendar = fallback.calendar;
  let deliveries = fallback.deliveries;
  let results = fallback.results;
  let integrations = fallback.integrations;
  let automations = fallback.automations;
  let prospects = fallback.prospects;
  let audiences = fallback.audiences;

  if (overviewResult.status === "fulfilled") {
    successfulReads += 1;
    const payload = asRecord(overviewResult.value);
    overview = normalizeOverview(payload, fallback.overview);
    channels = normalizeChannels(pick(payload, "channels", "channel_health"), fallback.channels);
    results = normalizeResults(pick(payload, "series", "timeline", "results"), fallback.results);
  } else {
    warnings.push(`Vue d'ensemble indisponible : ${safeErrorMessage(overviewResult.reason)}.`);
  }

  if (campaignsResult.status === "fulfilled") {
    successfulReads += 1;
    campaigns = normalizeCursorPage(campaignsResult.value, (item) => normalizeCampaign(item)).items;
  } else {
    warnings.push(`Campagnes backend indisponibles : ${safeErrorMessage(campaignsResult.reason)}.`);
  }

  if (calendarResult.status === "fulfilled") {
    successfulReads += 1;
    calendar = normalizeCursorPage(calendarResult.value, (item) => normalizeCalendarItem(item)).items;
  } else {
    warnings.push(`Calendrier backend indisponible : ${safeErrorMessage(calendarResult.reason)}.`);
  }

  if (deliveriesResult.status === "fulfilled") {
    successfulReads += 1;
    deliveries = normalizeCursorPage(deliveriesResult.value, (item) => normalizeDelivery(item)).items;
  } else {
    warnings.push(`Journal backend indisponible : ${safeErrorMessage(deliveriesResult.reason)}.`);
  }

  if (automationsResult.status === "fulfilled") {
    successfulReads += 1;
    automations = normalizeCursorPage(automationsResult.value, normalizeAutomation).items;
  } else {
    warnings.push(`Automatisations indisponibles : ${safeErrorMessage(automationsResult.reason)}.`);
  }

  if (integrationsResult.status === "fulfilled") {
    successfulReads += 1;
    const incomingIntegrations = normalizeCursorPage(
      integrationsResult.value,
      (item) => normalizeIntegration(item, fallback.integrations),
    ).items;
    integrations = [
      ...fallback.integrations.map((integration) => incomingIntegrations.find((item) => item.channel === integration.channel) || integration),
      ...incomingIntegrations.filter((item) => !fallback.integrations.some((integration) => integration.channel === item.channel)),
    ];
    channels = channels.map((channel) => {
      const integration = integrations.find((item) => item.channel === channel.id);
      return integration
        ? { ...channel, availability: integration.status, reason: integration.description, lastCheckedAt: integration.lastCheckedAt }
        : channel;
    });
  } else {
    warnings.push(`Intégrations indisponibles : ${safeErrorMessage(integrationsResult.reason)}.`);
  }

  if (contactsResult.status === "fulfilled") {
    successfulReads += 1;
    prospects = normalizeCursorPage(contactsResult.value, normalizeProspect).items;
    audiences = computeAudiencesFromProspects(prospects);
  } else {
    warnings.push(`Prospects indisponibles : ${safeErrorMessage(contactsResult.reason)}.`);
  }

  const source = successfulReads === 7 ? "backend" : successfulReads > 0 ? "mixed" : "fallback";
  if (source !== "backend") {
    warnings.unshift("Les sections backend indisponibles restent volontairement vides ou bloquées.");
  }

  return {
    ...fallback,
    overview,
    channels,
    campaigns,
    calendar,
    deliveries,
    results,
    integrations,
    automations,
    prospects,
    audiences,
    source,
    warnings,
  };
}

export async function upsertMarketingCampaign(draft: MarketingCampaignDraft, expectedUpdatedAt?: string | null) {
  const payload = {
    id: draft.id,
    name: draft.name,
    objective: draft.objective,
    content: { message: draft.message },
    audience_id: draft.audienceId,
    audience_name: draft.audienceName,
    audience_filter: draft.audienceFilter,
    audience_definition: draft.audienceFilter,
    channels: draft.channels,
    starts_at: draft.startsAt,
    ends_at: draft.endsAt,
    status: draft.status,
    requires_approval: draft.requiresApproval,
  };
  const result = await invokeRpc<unknown>("admin_upsert_marketing_campaign", {
    p_payload: payload,
    p_expected_updated_at: expectedUpdatedAt || null,
  });
  return normalizeCampaign(result);
}

export async function createMarketingCampaignBundle(
  draft: MarketingCampaignDraft,
  items: UnknownRecord[],
  clientRequestId: string,
) {
  const result = await invokeRpc<unknown>("admin_create_marketing_campaign_bundle", {
    p_payload: {
      campaign: {
        name: draft.name,
        objective: draft.objective,
        content: { message: draft.message },
        audience_id: draft.audienceId,
        audience_name: draft.audienceName,
        audience_filter: draft.audienceFilter,
        audience_definition: draft.audienceFilter,
        channels: draft.channels,
        starts_at: draft.startsAt,
        ends_at: draft.endsAt,
        status: "draft",
        requires_approval: true,
      },
      items,
    },
    p_client_request_id: clientRequestId,
  });
  const row = asRecord(result);
  return {
    campaign: normalizeCampaign(pick(row, "campaign")),
    items: asArray(pick(row, "items")).map((item) => normalizeCalendarItem(item)),
    complete: asBoolean(pick(row, "complete"), false),
    duplicate: asBoolean(pick(row, "duplicate"), false),
  };
}

export async function upsertMarketingCalendarItem(payload: UnknownRecord, expectedUpdatedAt?: string | null) {
  const result = await invokeRpc<unknown>("admin_upsert_marketing_calendar_item", {
    p_payload: payload,
    p_expected_updated_at: expectedUpdatedAt || null,
  });
  return normalizeCalendarItem(result);
}

export async function cancelMarketingItem(itemId: string, reason: string) {
  return invokeRpc<unknown>("admin_cancel_marketing_item", {
    p_item_id: itemId,
    p_reason: reason,
  });
}

export async function completeManualMarketingItem(
  itemId: string,
  outcome: "published" | "failed",
  note: string,
) {
  return invokeRpc<UnknownRecord>("admin_complete_manual_marketing_item", {
    p_item_id: itemId,
    p_outcome: outcome,
    p_note: note,
  });
}

export async function estimateMarketingAudience(filter: UnknownRecord, channels: MarketingChannelId[]) {
  const result = await invokeRpc<unknown>("admin_estimate_marketing_audience", {
    p_filter: filter,
    p_channels: channels,
  });
  const row = asRecord(result);
  const byChannel: MarketingAudienceEstimate["byChannel"] = {};
  const availabilityByChannel: MarketingAudienceEstimate["availabilityByChannel"] = {};
  for (const value of asArray(pick(row, "channels"))) {
    const channelEstimate = asRecord(value);
    const channel = asString(pick(channelEstimate, "channel")) as MarketingChannelId;
    if (channel) {
      byChannel[channel] = asNumber(pick(channelEstimate, "eligible", "eligible_count"));
      availabilityByChannel[channel] = normalizeAvailability(
        pick(channelEstimate, "availability"),
        "blocked_configuration",
      );
    }
  }
  return {
    total: asNumber(pick(row, "total")),
    eligible: asNumber(pick(row, "eligible_count", "eligible", "audience_size", "total")),
    byChannel,
    availabilityByChannel,
  } satisfies MarketingAudienceEstimate;
}

export async function approveMarketingCampaign(campaignId: string, reason: string) {
  return invokeRpc<UnknownRecord>("admin_approve_marketing_campaign", {
    p_campaign_id: campaignId,
    p_reason: reason,
  });
}

export async function approveMarketingItem(itemId: string, scheduledAt?: string | null) {
  return invokeRpc<UnknownRecord>("admin_approve_marketing_item", {
    p_item_id: itemId,
    p_scheduled_at: scheduledAt || null,
  });
}

export async function retryMarketingDelivery(deliveryId: string) {
  return invokeRpc<unknown>("admin_retry_marketing_delivery", {
    p_delivery_id: deliveryId,
  });
}

export async function completeManualMarketingDelivery(
  deliveryId: string,
  outcome: "completed" | "failed",
  note: string,
) {
  return invokeRpc<UnknownRecord>("admin_complete_manual_marketing_delivery", {
    p_delivery_id: deliveryId,
    p_outcome: outcome,
    p_note: note,
  });
}

export async function setMarketingGlobalPause(paused: boolean, reason: string) {
  return invokeRpc<unknown>("admin_set_marketing_global_pause", {
    p_paused: paused,
    p_reason: reason,
  });
}

export async function syncMarketingProspectCatalog(limit = 10_000) {
  const result = await invokeRpc<unknown>("admin_sync_marketing_prospect_catalog", {
    p_limit: limit,
  });
  return asRecord(result);
}

export async function syncMarketingClientConsents(limit = 10_000) {
  const result = await invokeRpc<unknown>("admin_sync_marketing_client_consents", {
    p_limit: limit,
  });
  return asRecord(result);
}

export async function upsertMarketingAutomation(payload: MarketingAutomationDraft, expectedUpdatedAt?: string | null) {
  const result = await invokeRpc<unknown>("admin_upsert_marketing_automation", {
    p_payload: {
      id: payload.id,
      name: payload.name,
      description: payload.description,
      trigger_type: payload.trigger,
      channel: payload.channel,
      status: payload.status,
      actions: [{ type: payload.action }],
    },
    p_expected_updated_at: expectedUpdatedAt || null,
  });
  return normalizeAutomation(result);
}

export async function runMarketingOrchestrator(action: "run_due" | "run_item", itemId?: string, limit = 25) {
  const { data, error } = await supabase.functions.invoke("marketing-orchestrator", {
    body: {
      action,
      ...(itemId ? { itemId } : {}),
      limit,
    },
  });
  if (error) throw error;
  return data;
}
