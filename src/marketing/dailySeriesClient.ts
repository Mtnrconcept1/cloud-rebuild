import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import { marketingPreviewImageUrl } from "@/marketing/postPreview";
import { MARKETING_TIME_ZONE } from "@/marketing/zurichTime";

export type MarketingDailyPublicationMode = "draft" | "automatic";

export type MarketingDailySeriesStatus = "active" | "paused";

export type MarketingDailyRun = {
  id: string;
  localDate: string;
  status: "running" | "succeeded" | "retrying" | "failed" | "unknown";
  attemptCount: number;
  scheduledAt: string | null;
  nextAttemptAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  calendarItemId: string | null;
  campaignId: string | null;
  title: string;
  imageUrl: string | null;
  publicationStatus: string | null;
};

export type MarketingDailySeriesDashboard = {
  series: {
    id: string;
    status: MarketingDailySeriesStatus;
    localTime: string;
    publicationMode: MarketingDailyPublicationMode;
    publicationLocalTime: string;
    publicationAuthorized: boolean;
    version: number;
    ownerAuthorized: boolean;
    activatedAt: string | null;
    updatedAt: string | null;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastError: string | null;
    generatedCount: number;
  };
  recentRuns: MarketingDailyRun[];
  runtimeEnabled: boolean;
  schedulerReady: boolean;
  publisherReady: boolean;
};

export type MarketingDailySeriesInput = {
  status: MarketingDailySeriesStatus;
  localTime: string;
  expectedVersion: number;
  publicationMode?: MarketingDailyPublicationMode;
  publicationLocalTime?: string;
  authorizeAutoPublication?: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function unwrap(value: unknown): unknown {
  for (let pass = 0; pass < 4; pass += 1) {
    if (Array.isArray(value) && value.length === 1) value = value[0];
    else {
      const item = record(value);
      if (item?.data !== undefined) value = item.data;
      else if (item?.result !== undefined) value = item.result;
      else return value;
    }
  }
  return value;
}

function text(value: unknown, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value, 64);
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function isMarketingDailyLocalTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function marketingDailyErrorLabel(code: string | null): string | null {
  if (!code) return null;
  const labels: Record<string, string> = {
    daily_publication_blocked: "Le post est conservé en brouillon : sa publication automatique n’a pas pu être confirmée. Ouvrez-le dans le calendrier.",
    daily_slot_expired: "Le créneau de ce jour est dépassé. La série reprendra au prochain créneau quotidien.",
    daily_retry_exhausted: "Les tentatives de ce jour ont échoué. Consultez le suivi avant la prochaine production.",
    daily_owner_not_authorized: "L’autorisation de la série doit être renouvelée par un administrateur.",
    marketing_daily_quality_title_mismatch: "Le titre du visuel ne correspond pas au message prévu. Une nouvelle génération est nécessaire.",
    marketing_daily_quality_title_exact: "Le texte du visuel doit être corrigé par une nouvelle génération.",
    marketing_daily_quality_text_legible: "Le texte du visuel manque de lisibilité. Une nouvelle génération est nécessaire.",
    marketing_daily_quality_single_visual: "L’image contient plusieurs visuels au lieu d’un post individuel. Elle a été refusée.",
    marketing_daily_quality_safe_margins: "Le texte ou le logo est trop près du bord. Le visuel a été refusé.",
    marketing_daily_image_dimensions: "Le visuel n’a pas le format portrait 4:5 attendu. Il a été refusé.",
    marketing_daily_key_missing: "Le service IA doit être configuré avant la prochaine génération.",
    marketing_daily_review_model_missing: "Le contrôle visuel doit être configuré avant la prochaine génération.",
    marketing_daily_references_missing: "Une référence de style manque. La génération attend le retour des références TOK.",
  };
  if (labels[code]) return labels[code];
  if (code.startsWith("marketing_daily_quality_")) return "Le visuel ne respecte pas encore l’identité TOK ou le message prévu. Il a été refusé.";
  if (code.startsWith("marketing_daily_storage_")) return "Le visuel n’a pas pu être enregistré. Son état sera vérifié à la prochaine tentative.";
  if (code === "marketing_daily_timeout" || /^marketing_daily_(image|review)_http_/.test(code)) return "Le service IA n’a pas répondu à temps ou est indisponible. Consultez la prochaine tentative.";
  if (code.startsWith("marketing_daily_review_")) return "Le contrôle de qualité n’a pas pu être terminé. Le visuel reste en attente de validation.";
  if (code.startsWith("marketing_daily_image_")) return "Le fichier reçu ne correspond pas à un visuel valide. Une nouvelle génération est nécessaire.";
  return "Le visuel de ce jour n’a pas pu être validé. Consultez son état et la prochaine tentative.";
}

export function normalizeMarketingDailySeriesDashboard(response: unknown): MarketingDailySeriesDashboard {
  const item = record(unwrap(response));
  const series = record(item?.series);
  const seriesId = uuid(series?.id);
  const version = nonNegativeInteger(series?.version);
  const generatedCount = nonNegativeInteger(series?.generated_count);
  const localTime = text(series?.local_time);
  const publicationMode = series?.publication_mode ?? "draft";
  const publicationLocalTime = text(series?.publication_local_time) || "16:00";
  if (!item || !series || !seriesId || !version || generatedCount === null
    || !["active", "paused"].includes(text(series.status))
    || series.key !== "tok-instagram" || series.channel !== "instagram"
    || series.timezone !== MARKETING_TIME_ZONE || series.format !== "4:5"
    || series.requires_approval !== true || !isMarketingDailyLocalTime(localTime)
    || !["draft", "automatic"].includes(String(publicationMode)) || !isMarketingDailyLocalTime(publicationLocalTime)
    || !Array.isArray(item.recent_runs)) {
    throw new Error("L’état de la série quotidienne n’a pas pu être confirmé.");
  }

  return {
    series: {
      id: seriesId,
      status: series.status as MarketingDailySeriesStatus,
      localTime,
      publicationMode: publicationMode as MarketingDailyPublicationMode,
      publicationLocalTime,
      publicationAuthorized: series.publication_authorized === true,
      version,
      ownerAuthorized: series.owner_authorized === true,
      activatedAt: timestamp(series.activated_at),
      updatedAt: timestamp(series.updated_at),
      nextRunAt: timestamp(series.next_run_at),
      lastRunAt: timestamp(series.last_run_at),
      lastError: text(series.last_error, 160) || null,
      generatedCount,
    },
    runtimeEnabled: item.runtime_enabled === true,
    schedulerReady: item.scheduler_ready === true,
    publisherReady: item.publisher_ready === true,
    recentRuns: item.recent_runs.slice(0, 30).flatMap((raw): MarketingDailyRun[] => {
      const run = record(raw);
      const id = uuid(run?.id);
      if (!run || !id) return [];
      const status = text(run.status);
      return [{
        id,
        localDate: /^\d{4}-\d{2}-\d{2}$/.test(text(run.local_date)) ? text(run.local_date) : "",
        status: ["running", "succeeded", "retrying", "failed"].includes(status)
          ? status as MarketingDailyRun["status"] : "unknown",
        attemptCount: nonNegativeInteger(run.attempt_count) ?? 0,
        scheduledAt: timestamp(run.scheduled_at),
        nextAttemptAt: timestamp(run.next_attempt_at),
        completedAt: timestamp(run.completed_at),
        lastError: text(run.last_error, 160) || null,
        calendarItemId: uuid(run.calendar_item_id),
        campaignId: uuid(run.campaign_id),
        title: text(run.title, 160) || "Publication Instagram du jour",
        imageUrl: marketingPreviewImageUrl(run.image_url),
        publicationStatus: text(run.publication_status, 40) || null,
      }];
    }),
  };
}

export async function loadMarketingDailySeries(signal?: AbortSignal): Promise<MarketingDailySeriesDashboard> {
  return normalizeMarketingDailySeriesDashboard(await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.rpc, {
    body: { operation: "admin_get_marketing_daily_series", args: {} },
    signal,
  }));
}

export async function updateMarketingDailySeries(input: MarketingDailySeriesInput): Promise<MarketingDailySeriesDashboard> {
  if (!["active", "paused"].includes(input.status) || !isMarketingDailyLocalTime(input.localTime)
    || (input.publicationMode !== undefined && !["draft", "automatic"].includes(input.publicationMode))
    || (input.publicationLocalTime !== undefined && !isMarketingDailyLocalTime(input.publicationLocalTime))
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error("Vérifiez l’heure et rechargez les réglages de la série.");
  }
  return normalizeMarketingDailySeriesDashboard(await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.rpc, {
    body: {
      operation: "admin_upsert_marketing_daily_series",
      args: { p_payload: {
        status: input.status,
        local_time: input.localTime,
        expected_version: input.expectedVersion,
        ...(input.publicationMode !== undefined ? { publication_mode: input.publicationMode } : {}),
        ...(input.publicationLocalTime !== undefined ? { publication_local_time: input.publicationLocalTime } : {}),
        ...(input.authorizeAutoPublication !== undefined ? { authorize_auto_publication: input.authorizeAutoPublication } : {}),
      } },
    },
  }));
}
