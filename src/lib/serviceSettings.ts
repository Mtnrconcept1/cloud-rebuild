import type { Json } from "@/integrations/supabase/types";

export type ServicePeriod = "lunch" | "dinner";

export const SERVICE_PERIOD_LABELS: Record<ServicePeriod, string> = {
  lunch: "Midi",
  dinner: "Soir",
};

export type ServiceSettings = {
  start_time: string;
  end_time: string;
  last_reservation_time: string;
  confirmation_deadline_minutes: number;
  deposit_amount_chf: number;
  max_covers: number;
  max_tables_per_slot: number;
  slot_interval_minutes: number;
  slot_capacity_windows: ServiceSlotCapacityWindow[];
  min_party_size: number;
  max_party_size: number;
  online_booking_enabled: boolean;
  restaurant_confirmation_required: boolean;
  service_closed: boolean;
  service_note: string;
};

export type ServiceSlotCapacityWindow = {
  start_time: string;
  end_time: string;
  max_tables: number;
};

export type ServiceSettingsMap = Record<ServicePeriod, ServiceSettings>;

export const DEFAULT_SERVICE_SETTINGS: ServiceSettingsMap = {
  lunch: {
    start_time: "12:00",
    end_time: "14:30",
    last_reservation_time: "14:00",
    confirmation_deadline_minutes: 15,
    deposit_amount_chf: 0,
    max_covers: 60,
    max_tables_per_slot: 8,
    slot_interval_minutes: 30,
    slot_capacity_windows: [
      { start_time: "12:00", end_time: "14:00", max_tables: 8 },
    ],
    min_party_size: 1,
    max_party_size: 8,
    online_booking_enabled: true,
    restaurant_confirmation_required: true,
    service_closed: false,
    service_note: "",
  },
  dinner: {
    start_time: "19:00",
    end_time: "22:30",
    last_reservation_time: "22:00",
    confirmation_deadline_minutes: 15,
    deposit_amount_chf: 0,
    max_covers: 80,
    max_tables_per_slot: 10,
    slot_interval_minutes: 30,
    slot_capacity_windows: [
      { start_time: "19:00", end_time: "22:00", max_tables: 10 },
    ],
    min_party_size: 1,
    max_party_size: 10,
    online_booking_enabled: true,
    restaurant_confirmation_required: true,
    service_closed: false,
    service_note: "",
  },
};

export const parseServiceTime = (value: string): number | null => {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
};

const toBoundedInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const toNonNegativeMoney = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed * 100) / 100);
};

const parseSlotCapacityWindows = (
  value: unknown,
  fallback: ServiceSlotCapacityWindow[],
): ServiceSlotCapacityWindow[] => {
  if (!Array.isArray(value)) return fallback;

  const parsed = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const start = typeof source.start_time === "string" ? source.start_time : "";
      const end = typeof source.end_time === "string" ? source.end_time : "";
      const maxTables = toPositiveInt(source.max_tables, 0);
      if (parseServiceTime(start) === null || parseServiceTime(end) === null || maxTables < 1) return null;
      return { start_time: start, end_time: end, max_tables: maxTables };
    })
    .filter((item): item is ServiceSlotCapacityWindow => !!item);

  return parsed.length > 0 ? parsed : fallback;
};

const parseServiceSettings = (value: unknown, fallback: ServiceSettings): ServiceSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;

  return {
    start_time: typeof source.start_time === "string" ? source.start_time : fallback.start_time,
    end_time: typeof source.end_time === "string" ? source.end_time : fallback.end_time,
    last_reservation_time:
      typeof source.last_reservation_time === "string" ? source.last_reservation_time : fallback.last_reservation_time,
    confirmation_deadline_minutes: toBoundedInt(source.confirmation_deadline_minutes, fallback.confirmation_deadline_minutes, 1, 240),
    deposit_amount_chf: toNonNegativeMoney(source.deposit_amount_chf, fallback.deposit_amount_chf),
    max_covers: toPositiveInt(source.max_covers, fallback.max_covers),
    max_tables_per_slot: toPositiveInt(source.max_tables_per_slot, fallback.max_tables_per_slot),
    slot_interval_minutes: toBoundedInt(source.slot_interval_minutes, fallback.slot_interval_minutes, 5, 120),
    slot_capacity_windows: parseSlotCapacityWindows(source.slot_capacity_windows, fallback.slot_capacity_windows),
    min_party_size: toPositiveInt(source.min_party_size, fallback.min_party_size),
    max_party_size: toPositiveInt(source.max_party_size, fallback.max_party_size),
    online_booking_enabled:
      typeof source.online_booking_enabled === "boolean"
        ? source.online_booking_enabled
        : fallback.online_booking_enabled,
    restaurant_confirmation_required:
      typeof source.restaurant_confirmation_required === "boolean"
        ? source.restaurant_confirmation_required
        : fallback.restaurant_confirmation_required,
    service_closed: typeof source.service_closed === "boolean" ? source.service_closed : fallback.service_closed,
    service_note: typeof source.service_note === "string" ? source.service_note : fallback.service_note,
  };
};

export const getServiceSettings = (openingHours: Json | null | undefined): ServiceSettingsMap => {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) {
    return DEFAULT_SERVICE_SETTINGS;
  }

  const openingHoursRecord = openingHours as Record<string, unknown>;
  const serviceSettings = openingHoursRecord.service_settings;

  if (!serviceSettings || typeof serviceSettings !== "object" || Array.isArray(serviceSettings)) {
    return DEFAULT_SERVICE_SETTINGS;
  }

  const serviceSettingsRecord = serviceSettings as Record<string, unknown>;

  return {
    lunch: parseServiceSettings(serviceSettingsRecord.lunch, DEFAULT_SERVICE_SETTINGS.lunch),
    dinner: parseServiceSettings(serviceSettingsRecord.dinner, DEFAULT_SERVICE_SETTINGS.dinner),
  };
};

export const mergeOpeningHoursWithServiceSettings = (
  openingHours: Json | null | undefined,
  serviceSettings: ServiceSettingsMap,
): Record<string, unknown> => {
  const openingHoursRecord =
    openingHours && typeof openingHours === "object" && !Array.isArray(openingHours)
      ? ({ ...(openingHours as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  openingHoursRecord.service_settings = serviceSettings;

  return openingHoursRecord;
};

export const detectServiceFromTime = (time: string): ServicePeriod => {
  const minutes = parseServiceTime(time);
  if (minutes === null) return "dinner";
  return minutes < 16 * 60 ? "lunch" : "dinner";
};

export const getServicePeriodFromMetadata = (
  metadata: unknown,
  time: string | null | undefined,
): ServicePeriod => {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const service = (metadata as Record<string, unknown>).service;
    if (service === "lunch" || service === "dinner") {
      return service;
    }
  }

  return detectServiceFromTime(time || "");
};

export const getServicePeriodLabel = (period: ServicePeriod): string => SERVICE_PERIOD_LABELS[period];

export const validateServiceSettings = (settings: ServiceSettings): string | null => {
  const start = parseServiceTime(settings.start_time);
  const end = parseServiceTime(settings.end_time);
  const lastReservation = parseServiceTime(settings.last_reservation_time);

  if (start === null || end === null || lastReservation === null) {
    return "Les horaires doivent être au format HH:MM.";
  }

  if (start >= end) {
    return "L'heure de début doit être antérieure à l'heure de fin.";
  }

  if (lastReservation < start || lastReservation > end) {
    return "La dernière réservation doit être comprise dans la plage du service.";
  }

  if (settings.max_covers < 1 || settings.min_party_size < 1 || settings.max_party_size < 1) {
    return "Les limites doivent être des valeurs positives.";
  }

  if (settings.confirmation_deadline_minutes < 1 || settings.confirmation_deadline_minutes > 240) {
    return "Le delai de confirmation doit etre compris entre 1 et 240 minutes.";
  }

  if (settings.deposit_amount_chf < 0) {
    return "L'acompte optionnel ne peut pas etre negatif.";
  }

  if (settings.max_tables_per_slot < 1 || settings.slot_interval_minutes < 5) {
    return "Les tables par créneau et l'intervalle doivent être positifs.";
  }

  for (const window of settings.slot_capacity_windows) {
    const windowStart = parseServiceTime(window.start_time);
    const windowEnd = parseServiceTime(window.end_time);
    if (windowStart === null || windowEnd === null) {
      return "Les plages de capacité doivent être au format HH:MM.";
    }
    if (windowStart > windowEnd) {
      return "Le début d'une plage de capacité doit être avant sa fin.";
    }
    if (window.max_tables < 1) {
      return "Chaque plage doit avoir au moins une table disponible.";
    }
  }

  if (settings.min_party_size > settings.max_party_size) {
    return "Le minimum de personnes ne peut pas dépasser le maximum.";
  }

  return null;
};

export const generateTimeSlotsForService = (
  settings: ServiceSettings,
  intervalMinutes?: number,
): string[] => {
  if (settings.service_closed || !settings.online_booking_enabled) return [];
  const start = parseServiceTime(settings.start_time);
  const last = parseServiceTime(settings.last_reservation_time);
  if (start === null || last === null || start > last) return [];

  const slots: string[] = [];
  const step = Math.max(5, Math.round(intervalMinutes ?? settings.slot_interval_minutes ?? 30));
  for (let minutes = start; minutes <= last; minutes += step) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    slots.push(`${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`);
  }
  return slots;
};

export const generateDailyTimeSlots = (
  serviceSettings: ServiceSettingsMap,
  intervalMinutes?: number,
): { lunch: string[]; dinner: string[]; all: string[] } => {
  const lunch = generateTimeSlotsForService(serviceSettings.lunch, intervalMinutes);
  const dinner = generateTimeSlotsForService(serviceSettings.dinner, intervalMinutes);
  return { lunch, dinner, all: [...lunch, ...dinner] };
};

export const isTimeWithinService = (time: string, settings: ServiceSettings): boolean => {
  const slot = parseServiceTime(time);
  const start = parseServiceTime(settings.start_time);
  const end = parseServiceTime(settings.end_time);
  const last = parseServiceTime(settings.last_reservation_time);

  if (slot === null || start === null || end === null || last === null) return false;

  return slot >= start && slot <= end && slot <= last;
};
