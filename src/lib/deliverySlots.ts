import type { Json } from "@/integrations/supabase/types";
import {
  SERVICE_PERIOD_LABELS,
  getConfiguredServiceSettings,
  hasConfiguredServiceSettings,
  type ServicePeriod,
  type ServiceSettings,
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

const getOrderServiceWindow = (settings: ServiceSettings) => {
  const onlineOrderingEnabled = settings.online_ordering_enabled !== false;
  const ordersClosed = settings.orders_closed === true;
  if (!onlineOrderingEnabled || ordersClosed || settings.service_closed) return null;

  const start = parseTime(settings.order_start_time || settings.start_time);
  const end = parseTime(settings.order_end_time || settings.end_time);
  if (start === null || end === null || start > end) return null;

  return { start, end };
};

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
    return false;
  }

  const dayKey = getFrenchDayKey(dateValue);
  if (!dayKey) return false;

  const record = openingHours as Record<string, unknown>;
  const dayValue = record[dayKey];

  if (typeof dayValue === "undefined") return hasConfiguredServiceSettings(openingHours);
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

  return hasConfiguredServiceSettings(openingHours);
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

  const settingsMap = getConfiguredServiceSettings(openingHours);
  if (!settingsMap) return [];

  const todayValue = getTodayDateValue(now);
  const thresholdMinutes =
    dateValue === todayValue
      ? now.getHours() * 60 + now.getMinutes() + leadMinutes
      : null;

  return (Object.entries(settingsMap) as [ServicePeriod, ServiceSettings][])
    .flatMap(([service, settings]) => {
      const orderWindow = getOrderServiceWindow(settings);
      if (!orderWindow) return [];
      const { start, end } = orderWindow;

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
