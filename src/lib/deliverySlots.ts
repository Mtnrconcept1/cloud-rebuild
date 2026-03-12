import type { Json } from "@/integrations/supabase/types";
import {
  SERVICE_PERIOD_LABELS,
  getServiceSettings,
  type ServicePeriod,
} from "@/lib/serviceSettings";

export type DeliveryScheduleMode = "asap" | "scheduled";

export type DeliverySlot = {
  time: string;
  label: string;
  service: ServicePeriod;
};

export type DeliverySlotGroup = {
  service: ServicePeriod;
  label: string;
  slots: DeliverySlot[];
};

const DAY_KEYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

const pad = (value: number) => String(value).padStart(2, "0");

const parseTime = (value: string): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const toDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const ceilToStep = (minutes: number, stepMinutes: number) =>
  Math.ceil(minutes / stepMinutes) * stepMinutes;

export const getTodayDateValue = (now = new Date()) => toDateInputValue(now);

export const getMaxScheduledDateValue = (daysAhead = 7, now = new Date()) => {
  const next = new Date(now);
  next.setDate(next.getDate() + daysAhead);
  return toDateInputValue(next);
};

export const getFrenchDayKey = (dateValue: string) => {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return DAY_KEYS[date.getDay()] || null;
};

export const isRestaurantOpenOnDate = (openingHours: Json | null | undefined, dateValue: string) => {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) {
    return true;
  }

  const dayKey = getFrenchDayKey(dateValue);
  if (!dayKey) return false;

  const record = openingHours as Record<string, unknown>;
  const dayValue = record[dayKey];

  if (typeof dayValue === "undefined") return true;
  if (dayValue === null) return false;
  if (typeof dayValue === "boolean") return dayValue;
  if (typeof dayValue === "string") {
    return !/(ferme|ferm[eé]e|closed)/i.test(dayValue);
  }
  if (typeof dayValue === "object" && !Array.isArray(dayValue)) {
    const normalized = dayValue as Record<string, unknown>;
    if (typeof normalized.closed === "boolean") return !normalized.closed;
    if (typeof normalized.open === "boolean") return normalized.open;
  }

  return true;
};

export const buildDeliverySlotGroups = ({
  openingHours,
  dateValue,
  leadMinutes,
  now = new Date(),
  stepMinutes = 15,
}: {
  openingHours: Json | null | undefined;
  dateValue: string;
  leadMinutes: number;
  now?: Date;
  stepMinutes?: number;
}): DeliverySlotGroup[] => {
  if (!isRestaurantOpenOnDate(openingHours, dateValue)) {
    return [];
  }

  const settingsMap = getServiceSettings(openingHours);
  const todayValue = getTodayDateValue(now);
  const thresholdMinutes =
    dateValue === todayValue
      ? now.getHours() * 60 + now.getMinutes() + leadMinutes
      : null;

  return (Object.entries(settingsMap) as [ServicePeriod, ReturnType<typeof getServiceSettings>[ServicePeriod]][])
    .flatMap(([service, settings]) => {
      if (!settings.online_booking_enabled || settings.service_closed) {
        return [];
      }

      const start = parseTime(settings.start_time);
      const end = parseTime(settings.end_time);

      if (start === null || end === null || start > end) {
        return [];
      }

      const firstSlot = thresholdMinutes === null
        ? start
        : Math.max(start, ceilToStep(thresholdMinutes, stepMinutes));

      if (firstSlot > end) {
        return [];
      }

      const slots: DeliverySlot[] = [];
      for (let value = firstSlot; value <= end; value += stepMinutes) {
        const time = formatTime(value);
        slots.push({
          time,
          label: time,
          service,
        });
      }

      if (!slots.length) {
        return [];
      }

      return [{
        service,
        label: SERVICE_PERIOD_LABELS[service],
        slots,
      }];
    });
};

export const findFirstAvailableDeliveryDate = ({
  openingHours,
  leadMinutes,
  maxDaysAhead = 7,
  now = new Date(),
}: {
  openingHours: Json | null | undefined;
  leadMinutes: number;
  maxDaysAhead?: number;
  now?: Date;
}) => {
  for (let offset = 0; offset <= maxDaysAhead; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const dateValue = toDateInputValue(date);
    const slots = buildDeliverySlotGroups({
      openingHours,
      dateValue,
      leadMinutes,
      now,
    });
    if (slots.some((group) => group.slots.length > 0)) {
      return dateValue;
    }
  }

  return getTodayDateValue(now);
};

export const formatScheduledDeliveryLabel = (dateValue: string, time: string) => {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return `${dateValue} a ${time}`;
  }

  return `${date.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} a ${time}`;
};

