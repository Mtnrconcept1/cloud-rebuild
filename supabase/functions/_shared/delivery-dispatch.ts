export type DeliveryDispatchConfig = {
  flexOption: "express" | "standard" | "flex";
  windowLabel: string;
  minMinutes: number;
  maxMinutes: number;
  baseRadiusKm: number;
  radiusStepKm: number;
  courierFanout: number;
  attemptTimeoutSeconds: number;
};

type DeliveryMetadata = Record<string, unknown> | null | undefined;

const DELIVERY_PROOF_CODE_LENGTH = 6;
const SCHEDULING_TIME_ZONE = "Europe/Zurich";
const DAY_KEYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

type ServicePeriod = "lunch" | "dinner";
type ResolvedServicePeriod = ServicePeriod | "opening_hours";

type ServiceSettings = {
  start_time: string;
  end_time: string;
  online_booking_enabled: boolean;
  service_closed: boolean;
};

const DEFAULT_SERVICE_SETTINGS: Record<ServicePeriod, ServiceSettings> = {
  lunch: {
    start_time: "12:00",
    end_time: "14:30",
    online_booking_enabled: true,
    service_closed: false,
  },
  dinner: {
    start_time: "19:00",
    end_time: "22:30",
    online_booking_enabled: true,
    service_closed: false,
  },
};

const pad = (value: number) => String(value).padStart(2, "0");

const parseTime = (value: string): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

function getDayKey(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return DAY_KEYS[date.getDay()] || null;
}

function parseServiceSettings(value: unknown, fallback: ServiceSettings): ServiceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;

  return {
    start_time: typeof source.start_time === "string" ? source.start_time : fallback.start_time,
    end_time: typeof source.end_time === "string" ? source.end_time : fallback.end_time,
    online_booking_enabled:
      typeof source.online_booking_enabled === "boolean"
        ? source.online_booking_enabled
        : fallback.online_booking_enabled,
    service_closed: typeof source.service_closed === "boolean" ? source.service_closed : fallback.service_closed,
  };
}

function getServiceSettings(openingHours: unknown): Record<ServicePeriod, ServiceSettings> {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) {
    return DEFAULT_SERVICE_SETTINGS;
  }

  const serviceSettings = (openingHours as Record<string, unknown>).service_settings;
  if (!serviceSettings || typeof serviceSettings !== "object" || Array.isArray(serviceSettings)) {
    return DEFAULT_SERVICE_SETTINGS;
  }

  const record = serviceSettings as Record<string, unknown>;
  return {
    lunch: parseServiceSettings(record.lunch, DEFAULT_SERVICE_SETTINGS.lunch),
    dinner: parseServiceSettings(record.dinner, DEFAULT_SERVICE_SETTINGS.dinner),
  };
}

function hasConfiguredServiceSettings(openingHours: unknown) {
  return Boolean(
    openingHours
      && typeof openingHours === "object"
      && !Array.isArray(openingHours)
      && (openingHours as Record<string, unknown>).service_settings
      && typeof (openingHours as Record<string, unknown>).service_settings === "object"
      && !Array.isArray((openingHours as Record<string, unknown>).service_settings),
  );
}

function isRestaurantOpenOnDate(openingHours: unknown, dateValue: string) {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) {
    return true;
  }

  const dayKey = getDayKey(dateValue);
  if (!dayKey) return false;

  const value = (openingHours as Record<string, unknown>)[dayKey];
  if (typeof value === "undefined") return true;
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return !/(ferme|ferm[eé]e|closed)/i.test(value);
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.closed === "boolean") return !record.closed;
    if (typeof record.open === "boolean") return record.open;
  }

  return true;
}

function getDayOpeningValue(openingHours: unknown, dateValue: string) {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return undefined;

  const dayKey = getDayKey(dateValue);
  if (!dayKey) return undefined;

  return (openingHours as Record<string, unknown>)[dayKey];
}

function parseOpeningWindow(value: unknown): ServiceSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const startTime = typeof record.open === "string"
    ? record.open
    : typeof record.start === "string"
      ? record.start
      : typeof record.start_time === "string"
        ? record.start_time
        : "";
  const endTime = typeof record.close === "string"
    ? record.close
    : typeof record.end === "string"
      ? record.end
      : typeof record.end_time === "string"
        ? record.end_time
        : "";

  if (record.closed === true || !startTime || !endTime) return null;

  return {
    start_time: startTime,
    end_time: endTime,
    online_booking_enabled: true,
    service_closed: false,
  };
}

function getOpeningHourWindows(openingHours: unknown, dateValue: string): ServiceSettings[] {
  const dayValue = getDayOpeningValue(openingHours, dateValue);

  if (typeof dayValue === "string") {
    if (/(ferme|ferm[eé]e|closed)/i.test(dayValue)) return [];
    const match = /([0-2]\d:[0-5]\d)\s*[-a]\s*([0-2]\d:[0-5]\d)/i.exec(dayValue);
    return match ? [{
      start_time: match[1],
      end_time: match[2],
      online_booking_enabled: true,
      service_closed: false,
    }] : [];
  }

  if (Array.isArray(dayValue)) {
    return dayValue
      .map(parseOpeningWindow)
      .filter((window): window is ServiceSettings => Boolean(window));
  }

  const parsed = parseOpeningWindow(dayValue);
  return parsed ? [parsed] : [];
}

function getTimeZoneOffset(date: Date, timeZone = SCHEDULING_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value || "GMT+1";
  const match = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(value);
  if (!match) return "+01:00";

  const numericHours = Number(match[1]);
  const sign = numericHours >= 0 ? "+" : "-";
  const hours = pad(Math.abs(numericHours));
  const minutes = match[2] || "00";
  return `${sign}${hours}:${minutes}`;
}

function toScheduledUtcIso(dateValue: string, timeValue: string, timeZone = SCHEDULING_TIME_ZONE) {
  const guess = new Date(`${dateValue}T${timeValue}:00Z`);
  const offset = getTimeZoneOffset(guess, timeZone);
  return new Date(`${dateValue}T${timeValue}:00${offset}`).toISOString();
}

function isTimeWithinService(timeValue: string, settings: ServiceSettings) {
  const slot = parseTime(timeValue);
  const start = parseTime(settings.start_time);
  const end = parseTime(settings.end_time);

  if (slot === null || start === null || end === null) return false;
  return slot >= start && slot <= end;
}

export async function resolveScheduledDelivery(
  adminClient: any,
  restaurantId: string,
  metadata: DeliveryMetadata,
) {
  const scheduleMode = String(metadata?.delivery_schedule_mode || "").trim().toLowerCase();
  const dateValue = String(metadata?.delivery_date || "").trim();
  const timeValue = String(metadata?.delivery_time || "").trim();

  if (scheduleMode !== "scheduled" || !dateValue || !timeValue) {
    return null;
  }

  const { data: restaurant, error } = await adminClient
    .from("restaurants")
    .select("opening_hours")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) throw error;

  if (!isRestaurantOpenOnDate(restaurant?.opening_hours, dateValue)) {
    throw new Error("Le restaurant est ferme a la date choisie pour la livraison.");
  }

  const serviceEntries = hasConfiguredServiceSettings(restaurant?.opening_hours)
    ? (Object.entries(getServiceSettings(restaurant?.opening_hours)) as [ResolvedServicePeriod, ServiceSettings][])
    : getOpeningHourWindows(restaurant?.opening_hours, dateValue)
        .map((settings): [ResolvedServicePeriod, ServiceSettings] => ["opening_hours", settings]);
  const matchingService = serviceEntries
    .find(([, settings]) => settings.online_booking_enabled && !settings.service_closed && isTimeWithinService(timeValue, settings));

  if (!matchingService) {
    throw new Error("L'horaire choisi n'entre dans aucun service actif du restaurant.");
  }

  const [service, settings] = matchingService;
  const scheduledAt = toScheduledUtcIso(dateValue, timeValue);
  const startWindow = toScheduledUtcIso(dateValue, settings.start_time);
  const endWindow = toScheduledUtcIso(dateValue, settings.end_time);
  const now = Date.now();
  const config = getDeliveryDispatchConfig(metadata);

  if (Number.isNaN(Date.parse(scheduledAt)) || Number.isNaN(Date.parse(startWindow)) || Number.isNaN(Date.parse(endWindow))) {
    throw new Error("L'horaire de livraison choisi est invalide.");
  }

  if (Date.parse(scheduledAt) <= now + config.maxMinutes * 60 * 1000) {
    throw new Error(`Choisissez une heure de livraison au moins ${config.maxMinutes} minutes dans le futur.`);
  }

  return {
    service,
    dateValue,
    timeValue,
    scheduledAt,
    scheduledLabel: `${dateValue} a ${timeValue}`,
  };
}

export function shouldDispatchDeliveryNow(metadata: DeliveryMetadata, scheduledAt?: string | null, now = new Date()) {
  if (!scheduledAt) return true;
  const config = getDeliveryDispatchConfig(metadata);
  return now.getTime() >= Date.parse(scheduledAt) - config.maxMinutes * 60 * 1000;
}

export function getEstimatedArrivalTime(metadata: DeliveryMetadata, scheduledAt?: string | null, now = new Date()) {
  if (scheduledAt) return scheduledAt;
  const config = getDeliveryDispatchConfig(metadata);
  return new Date(now.getTime() + config.maxMinutes * 60 * 1000).toISOString();
}

export function normalizeFlexOption(value: unknown): "express" | "standard" | "flex" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "express" || normalized === "flex") return normalized;
  return "standard";
}

export function getDeliveryDispatchConfig(
  metadata: DeliveryMetadata,
  round = 1,
  radiusOverrideKm?: number | null,
): DeliveryDispatchConfig & { radiusKm: number } {
  const flexOption = normalizeFlexOption(metadata?.flex_option);

  const baseConfig: DeliveryDispatchConfig = flexOption === "express"
    ? {
        flexOption,
        windowLabel: "30 min",
        minMinutes: 30,
        maxMinutes: 30,
        baseRadiusKm: 3.5,
        radiusStepKm: 1.5,
        courierFanout: 3,
        attemptTimeoutSeconds: 30,
      }
    : flexOption === "flex"
      ? {
          flexOption,
          windowLabel: "1h a 1h30",
          minMinutes: 60,
          maxMinutes: 90,
          baseRadiusKm: 9,
          radiusStepKm: 3,
          courierFanout: 8,
          attemptTimeoutSeconds: 60,
        }
      : {
          flexOption,
          windowLabel: "45 min",
          minMinutes: 45,
          maxMinutes: 45,
          baseRadiusKm: 5.5,
          radiusStepKm: 2,
          courierFanout: 5,
          attemptTimeoutSeconds: 45,
        };

  const radiusKm = radiusOverrideKm && radiusOverrideKm > 0
    ? radiusOverrideKm
    : Number((baseConfig.baseRadiusKm + (Math.max(round, 1) - 1) * baseConfig.radiusStepKm).toFixed(2));

  return {
    ...baseConfig,
    radiusKm,
  };
}

export function normalizeDeliveryProofCode(value: unknown) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, DELIVERY_PROOF_CODE_LENGTH);
}

export function generateDeliveryProofCode(existingValue?: unknown) {
  const existing = normalizeDeliveryProofCode(existingValue);
  if (existing.length === DELIVERY_PROOF_CODE_LENGTH) return existing;
  const randomNumber = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(randomNumber).padStart(DELIVERY_PROOF_CODE_LENGTH, "0");
}

export function isDeliveryOrder(input: {
  deliveryAddress?: string | null;
  metadata?: DeliveryMetadata;
  orderType?: string | null;
}) {
  const metadata = input.metadata || {};
  const explicitType = String(input.orderType || metadata.type || "").trim().toLowerCase();
  const feature = String(metadata.feature || "").trim().toLowerCase();
  const hasPickupTime = Boolean(metadata.pickup_time || metadata.arrival_time);

  if (explicitType && explicitType !== "delivery") return false;
  if (!input.deliveryAddress) return false;
  if (feature === "zero-attente") return false;
  return !hasPickupTime;
}

export function enrichDeliveryMetadata(metadata: DeliveryMetadata) {
  const config = getDeliveryDispatchConfig(metadata);
  const proofCode = generateDeliveryProofCode(metadata?.delivery_proof_code);

  return {
    ...(metadata || {}),
    flex_option: config.flexOption,
    delivery_window_label: config.windowLabel,
    delivery_window_min_minutes: config.minMinutes,
    delivery_window_max_minutes: config.maxMinutes,
    dispatch_base_radius_km: config.baseRadiusKm,
    dispatch_radius_step_km: config.radiusStepKm,
    dispatch_courier_fanout: config.courierFanout,
    dispatch_timeout_seconds: config.attemptTimeoutSeconds,
    delivery_proof_required: true,
    delivery_proof_code: proofCode,
  };
}

export async function triggerDispatchOrder(input: {
  orderId?: string | null;
  dispatchJobId?: string | null;
  round?: number;
  radiusKm?: number | null;
}) {
  const dispatchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-order`;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!dispatchUrl || !serviceRoleKey) {
    return { ok: false, error: "Dispatch configuration missing" };
  }

  const response = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      order_id: input.orderId || null,
      dispatch_job_id: input.dispatchJobId || null,
      round: input.round || 1,
      radius_km: input.radiusKm || null,
    }),
  });
  const body = await response.text();
  let parsedBody: Record<string, unknown> | null = null;
  try {
    parsedBody = body ? JSON.parse(body) as Record<string, unknown> : null;
  } catch {
    parsedBody = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    error: typeof parsedBody?.error === "string" ? parsedBody.error : null,
    diagnostic: parsedBody?.diagnostic && typeof parsedBody.diagnostic === "object"
      ? parsedBody.diagnostic as Record<string, unknown>
      : null,
  };
}
