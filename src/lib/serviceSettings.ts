import type { Json } from "@/integrations/supabase/types";

export type ServicePeriod = "lunch" | "dinner";

export type ServiceSettings = {
  start_time: string;
  end_time: string;
  last_reservation_time: string;
  max_covers: number;
  min_party_size: number;
  max_party_size: number;
  online_booking_enabled: boolean;
  service_closed: boolean;
  service_note: string;
};

export type ServiceSettingsMap = Record<ServicePeriod, ServiceSettings>;

export const DEFAULT_SERVICE_SETTINGS: ServiceSettingsMap = {
  lunch: {
    start_time: "12:00",
    end_time: "14:30",
    last_reservation_time: "14:00",
    max_covers: 60,
    min_party_size: 1,
    max_party_size: 8,
    online_booking_enabled: true,
    service_closed: false,
    service_note: "",
  },
  dinner: {
    start_time: "19:00",
    end_time: "22:30",
    last_reservation_time: "22:00",
    max_covers: 80,
    min_party_size: 1,
    max_party_size: 10,
    online_booking_enabled: true,
    service_closed: false,
    service_note: "",
  },
};

const parseTime = (value: string): number | null => {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
};

const parseServiceSettings = (value: unknown, fallback: ServiceSettings): ServiceSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;

  return {
    start_time: typeof source.start_time === "string" ? source.start_time : fallback.start_time,
    end_time: typeof source.end_time === "string" ? source.end_time : fallback.end_time,
    last_reservation_time:
      typeof source.last_reservation_time === "string" ? source.last_reservation_time : fallback.last_reservation_time,
    max_covers: toPositiveInt(source.max_covers, fallback.max_covers),
    min_party_size: toPositiveInt(source.min_party_size, fallback.min_party_size),
    max_party_size: toPositiveInt(source.max_party_size, fallback.max_party_size),
    online_booking_enabled:
      typeof source.online_booking_enabled === "boolean"
        ? source.online_booking_enabled
        : fallback.online_booking_enabled,
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
  const minutes = parseTime(time);
  if (minutes === null) return "dinner";
  return minutes < 16 * 60 ? "lunch" : "dinner";
};

export const validateServiceSettings = (settings: ServiceSettings): string | null => {
  const start = parseTime(settings.start_time);
  const end = parseTime(settings.end_time);
  const lastReservation = parseTime(settings.last_reservation_time);

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

  if (settings.min_party_size > settings.max_party_size) {
    return "Le minimum de personnes ne peut pas dépasser le maximum.";
  }

  return null;
};

export const isTimeWithinService = (time: string, settings: ServiceSettings): boolean => {
  const slot = parseTime(time);
  const start = parseTime(settings.start_time);
  const end = parseTime(settings.end_time);
  const last = parseTime(settings.last_reservation_time);

  if (slot === null || start === null || end === null || last === null) return false;

  return slot >= start && slot <= end && slot <= last;
};