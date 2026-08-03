import { addDays, subDays } from "date-fns";

import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import {
  MARKETING_BFF_ENDPOINTS,
  marketingBffRequest,
} from "@/marketing/marketingBffClient";
import {
  marketingZurichDateBoundaryToIso,
  marketingZurichLocalDateTimeToIso,
} from "@/marketing/zurichTime";
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
  MarketingContactListParams,
  MarketingContactType,
  MarketingDelivery,
  MarketingDeliveryListParams,
  MarketingIntegration,
  MarketingOverview,
  MarketingProspect,
  MarketingManualTarget,
  MarketingOffsetPage,
  MarketingRestaurantContactDraft,
  MarketingAudience,
  MarketingResultPoint,
  MarketingSourceSyncBatch,
  MarketingSnapshot,
} from "@/marketing/types";

type UnknownRecord = Record<string, unknown>;

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
  const payload = await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.rpc, {
    method: "POST",
    body: { operation: name, args },
  });
  const envelope = asRecord(payload);
  if (Object.prototype.hasOwnProperty.call(envelope, "data")) return envelope.data as T;
  if (Object.prototype.hasOwnProperty.call(envelope, "result")) return envelope.result as T;
  return payload as T;
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
    // Naming the recipient answers "have we already contacted them?" without
    // widening what is exposed: the address stays masked below.
    contactId: asString(pick(row, "contact_id", "contactId"), fallback?.contactId || "") || null,
    contactName: asString(pick(row, "contact_name", "contactName"), fallback?.contactName || "") || null,
    contactCity: asString(pick(row, "contact_city", "contactCity"), fallback?.contactCity || "") || null,
    contactPostalCode:
      asString(pick(row, "contact_postal_code", "contactPostalCode"), fallback?.contactPostalCode || "") || null,
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
  const rawEmailMasked = asString(pick(row, "email_masked", "emailMasked")) || null;
  const rawPhoneMasked = asString(pick(row, "phone_masked", "phoneMasked")) || null;
  const hasEmail = asBoolean(
    pick(row, "has_email", "hasEmail"),
    Boolean(rawEmailMasked && rawEmailMasked !== "***"),
  );
  const hasPhone = asBoolean(
    pick(row, "has_phone", "hasPhone"),
    Boolean(rawPhoneMasked && rawPhoneMasked !== "***"),
  );
  const emailMasked = hasEmail ? rawEmailMasked : null;
  const phoneMasked = hasPhone ? rawPhoneMasked : null;
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
      ? "tok_news"
      : contactType === "registered_user" && ["consent", "existing_customer"].includes(lawfulBasis || "")
        ? "in_app"
      : contactability !== "ready"
        ? "tok_news"
      : hasPhone && ["consent", "existing_customer", "legitimate_interest"].includes(lawfulBasis || "")
        ? "manual_call"
        : hasEmail && ["consent", "existing_customer"].includes(lawfulBasis || "")
          ? "manual_email"
          : "tok_news",
    contactability,
    lastContactAt: asString(pick(row, "last_contact_at", "lastContactAt")) || null,
    nextActionAt: asString(pick(row, "next_action_at", "nextActionAt")) || null,
    tags: [
      asString(pick(row, "canton")),
      lawfulBasis || "",
    ].filter(Boolean),
    hasEmail,
    hasPhone,
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
        item.hasPhone
        && ["consent", "existing_customer", "legitimate_interest"].includes(item.lawfulBasis || "")
      )).length;
      const emailReady = activeItems.filter((item) => (
        item.hasEmail
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
              : "tok_news" as const,
        updatedAt:
          items.map((item) => item.updatedAt).sort()[items.length - 1] || new Date().toISOString(),
        computed: true,
        sampleLimited: true,
      };
    })
    .sort((left, right) => right.total - left.total);
}

function assertMarketingOffsetParams(limit: number, offset: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Taille de page marketing invalide.");
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    throw new Error("Position de page marketing invalide.");
  }
}

function normalizeMarketingListQuery(query: string) {
  const normalized = query.trim();
  if (normalized.length > 80 || /[%_\\]/.test(normalized)) {
    throw new Error("Recherche marketing invalide (80 caractères maximum, sans %, _ ni \\).");
  }
  return normalized || null;
}

function normalizeOffsetPage<T>(
  value: unknown,
  normalizer: (item: unknown) => T,
  limit: number,
  offset: number,
): MarketingOffsetPage<T> {
  const row = asRecord(value);
  const rawItems = pick(row, "items", "data");
  const rawTotal = pick(row, "total");
  const total = Number(rawTotal);
  if (
    !Array.isArray(rawItems)
    || !Number.isSafeInteger(total)
    || total < 0
    || rawItems.length > limit
    || rawItems.length > total
    || (rawItems.length > 0 && offset >= total)
  ) {
    throw new Error("Réponse de pagination marketing invalide.");
  }
  return {
    items: rawItems.map(normalizer),
    total,
  };
}

export async function listMarketingContactsPage(
  params: MarketingContactListParams,
): Promise<MarketingOffsetPage<MarketingProspect>> {
  assertMarketingOffsetParams(params.limit, params.offset);
  const result = await invokeRpc<unknown>("admin_list_marketing_contacts", {
    p_query: normalizeMarketingListQuery(params.query),
    p_status: params.status,
    p_channel: params.channel,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  return normalizeOffsetPage(result, normalizeProspect, params.limit, params.offset);
}

export async function listMarketingDeliveriesPage(
  params: MarketingDeliveryListParams,
): Promise<MarketingOffsetPage<MarketingDelivery>> {
  assertMarketingOffsetParams(params.limit, params.offset);
  const result = await invokeRpc<unknown>("admin_list_marketing_deliveries", {
    p_query: normalizeMarketingListQuery(params.query),
    p_status: params.status,
    p_channel: params.channel,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  return normalizeOffsetPage(result, (item) => normalizeDelivery(item), params.limit, params.offset);
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
    listMarketingDeliveriesPage({
      query: "",
      status: null,
      channel: null,
      limit: 200,
      offset: 0,
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
    listMarketingContactsPage({
      query: "",
      status: null,
      channel: null,
      limit: 100,
      offset: 0,
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
    deliveries = deliveriesResult.value.items;
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
    prospects = contactsResult.value.items;
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

export async function upsertMarketingRestaurantContact(
  draft: MarketingRestaurantContactDraft,
) {
  const evidenceAt = marketingZurichLocalDateTimeToIso(draft.evidenceAt);
  if (!evidenceAt) throw new Error("Date de preuve invalide en heure suisse.");
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  const result = await invokeRpc<unknown>("admin_upsert_marketing_contact", {
    p_payload: {
      ...(draft.id ? { id: draft.id } : {}),
      display_name: draft.displayName.trim(),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      city: draft.city.trim(),
      canton: draft.canton.trim().toUpperCase(),
      category: draft.category.trim(),
      lawful_basis: draft.lawfulBasis,
      evidence_source: draft.evidenceSource.trim(),
      evidence_note: draft.evidenceNote.trim(),
      evidence_at: evidenceAt,
    },
    p_expected_updated_at: draft.expectedUpdatedAt || null,
  });
  return normalizeProspect(result);
}

export async function suppressMarketingContact(contactId: string, reason: string) {
  return invokeRpc<UnknownRecord>("admin_suppress_marketing_contact", {
    p_contact_id: contactId,
    p_reason: reason.trim(),
  });
}

export async function revealManualMarketingDeliveryTarget(
  deliveryId: string,
  reason: string,
): Promise<MarketingManualTarget> {
  const result = asRecord(await invokeRpc<unknown>("admin_reveal_manual_delivery_target", {
    p_delivery_id: deliveryId,
    p_reason: reason.trim(),
  }));
  const responseDeliveryId = asString(pick(result, "delivery_id"));
  const channel = asString(pick(result, "channel"));
  const target = asString(pick(result, "target"));
  if (
    responseDeliveryId !== deliveryId
    || !["manual_call", "manual_email"].includes(channel)
    || !target
  ) {
    throw new Error("Le backend n'a pas retourné de cible manuelle exploitable.");
  }
  return {
    deliveryId: responseDeliveryId,
    channel: channel as MarketingManualTarget["channel"],
    target,
    revealedAt: asString(pick(result, "revealed_at"), new Date().toISOString()),
  };
}

export async function setMarketingGlobalPause(paused: boolean, reason: string) {
  return invokeRpc<unknown>("admin_set_marketing_global_pause", {
    p_paused: paused,
    p_reason: reason,
  });
}

function normalizeSourceSyncBatch(value: unknown): MarketingSourceSyncBatch {
  const row = asRecord(value);
  const requiredCount = (...keys: string[]) => {
    const count = Number(pick(row, ...keys));
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Compteurs de synchronisation invalides.");
    }
    return count;
  };
  const optionalCount = (...keys: string[]) => {
    const value = pick(row, ...keys);
    return value === undefined || value === null ? 0 : requiredCount(...keys);
  };
  const rawHasMore = pick(row, "has_more", "hasMore");
  const rawComplete = pick(row, "complete");
  const rawNextCursor = pick(row, "next_cursor", "nextCursor");
  if (
    rawNextCursor !== undefined
    && rawNextCursor !== null
    && (typeof rawNextCursor !== "string"
      || rawNextCursor.length > 512
      || !/^[A-Za-z0-9+/=]+$/.test(rawNextCursor))
  ) {
    throw new Error("Curseur de synchronisation invalide.");
  }
  const nextCursor = typeof rawNextCursor === "string" ? rawNextCursor : null;
  const hasMore = typeof rawHasMore === "boolean" ? rawHasMore : null;
  const complete = typeof rawComplete === "boolean" ? rawComplete : null;
  if (
    hasMore === null
    || complete === null
    || hasMore === complete
    || (hasMore && !nextCursor)
  ) {
    throw new Error("État de reprise de synchronisation invalide.");
  }
  return {
    processed: requiredCount("processed"),
    inserted: requiredCount("inserted"),
    updated: requiredCount("updated"),
    suppressed: optionalCount("suppressed"),
    reconsented: optionalCount("reconsented", "reconsent"),
    nextCursor,
    watermark: asString(pick(row, "watermark")) || null,
    hasMore,
    complete,
  };
}

function assertMarketingSyncLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new Error("Taille de lot de synchronisation invalide.");
  }
}

export async function syncMarketingProspectCatalog(params: {
  limit: number;
  afterSourceObjectId: string | null;
  untilSourceObjectId: string | null;
}) {
  assertMarketingSyncLimit(params.limit);
  const result = await invokeRpc<unknown>("admin_sync_marketing_prospect_catalog", {
    p_limit: params.limit,
    p_after_source_objectid: params.afterSourceObjectId,
    p_until_source_objectid: params.untilSourceObjectId,
  });
  return normalizeSourceSyncBatch(result);
}

export async function syncMarketingClientConsents(params: {
  limit: number;
  cursor: string | null;
}) {
  assertMarketingSyncLimit(params.limit);
  const result = await invokeRpc<unknown>("admin_sync_marketing_client_consents", {
    p_limit: params.limit,
    p_cursor: params.cursor,
  });
  return normalizeSourceSyncBatch(result);
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
  const payload = await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.orchestrator, {
    method: "POST",
    body: {
      action,
      ...(itemId ? { itemId } : {}),
      limit,
    },
  });
  const envelope = asRecord(payload);
  if (Object.prototype.hasOwnProperty.call(envelope, "data")) return envelope.data;
  if (Object.prototype.hasOwnProperty.call(envelope, "result")) return envelope.result;
  return payload;
}
