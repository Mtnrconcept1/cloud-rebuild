import type { DeliveryScheduleMode } from "@/lib/deliverySlots";
import { detectServiceFromTime, type ServicePeriod } from "@/lib/serviceSettings";

type CartLikeItem = {
  metadata?: Record<string, any> | null;
};

export type GuaranteedDeliveryCartContext = {
  deliveryScheduleMode: DeliveryScheduleMode;
  deliveryDate: string;
  deliveryTime: string;
  deliveryService: ServicePeriod;
  scheduledDeliveryLabel: string;
  guaranteedDeliveryWindow: string | null;
  guaranteedDeliveryLevelId: string | null;
  guaranteedDeliveryLevelLabel: string | null;
  guaranteedDeliveryWindowMinutes: number | null;
  guaranteedDeliveryCompensation: string | null;
  guaranteedDeliveryPremium: number;
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isGuaranteedDeliveryMetadata(metadata: unknown) {
  return isRecord(metadata)
    && (metadata.feature === "creneaux-garantis" || metadata.is_guaranteed_delivery_slot === true);
}

function readString(source: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readNullableString(source: Record<string, any>, key: string) {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableNumber(source: Record<string, any>, key: string) {
  const value = Number(source[key]);
  return Number.isFinite(value) ? value : null;
}

function normalizeDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function normalizeTime(value: string | null) {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function readService(source: Record<string, any>, time: string): ServicePeriod {
  const service = source.delivery_service || source.service;
  return service === "lunch" || service === "dinner" ? service : detectServiceFromTime(time);
}

function readContextFromMetadata(source: Record<string, any>): GuaranteedDeliveryCartContext | null {
  const deliveryDate = normalizeDate(readString(source, ["delivery_date", "date"]));
  const deliveryTime = normalizeTime(readString(source, ["delivery_time", "time"]));
  if (!deliveryDate || !deliveryTime) return null;

  return {
    deliveryScheduleMode: "scheduled",
    deliveryDate,
    deliveryTime,
    deliveryService: readService(source, deliveryTime),
    scheduledDeliveryLabel:
      readString(source, ["scheduled_delivery_label"])
      || `${deliveryDate} a ${deliveryTime}`,
    guaranteedDeliveryWindow: readNullableString(source, "guaranteed_delivery_window")
      || readNullableString(source, "window"),
    guaranteedDeliveryLevelId: readNullableString(source, "guaranteed_delivery_level_id"),
    guaranteedDeliveryLevelLabel: readNullableString(source, "guaranteed_delivery_level_label"),
    guaranteedDeliveryWindowMinutes: readNullableNumber(source, "guaranteed_delivery_window_minutes"),
    guaranteedDeliveryCompensation: readNullableString(source, "guaranteed_delivery_compensation"),
    guaranteedDeliveryPremium: readNullableNumber(source, "guaranteed_delivery_premium") ?? 0,
  };
}

export function getGuaranteedDeliveryCartContext(
  cartMetadata: Record<string, any>,
  items: CartLikeItem[],
): GuaranteedDeliveryCartContext | null {
  if (isGuaranteedDeliveryMetadata(cartMetadata)) {
    return readContextFromMetadata(cartMetadata);
  }

  const itemMetadata = items.find((item) => isGuaranteedDeliveryMetadata(item.metadata))?.metadata;
  return itemMetadata ? readContextFromMetadata(itemMetadata) : null;
}

export function buildGuaranteedDeliveryOrderMetadata(context: GuaranteedDeliveryCartContext | null) {
  if (!context) return {};

  return {
    feature: "creneaux-garantis",
    is_guaranteed_delivery_slot: true,
    delivery_schedule_mode: context.deliveryScheduleMode,
    delivery_date: context.deliveryDate,
    delivery_time: context.deliveryTime,
    delivery_service: context.deliveryService,
    scheduled_delivery_label: context.scheduledDeliveryLabel,
    guaranteed_delivery_window: context.guaranteedDeliveryWindow,
    guaranteed_delivery_level_id: context.guaranteedDeliveryLevelId,
    guaranteed_delivery_level_label: context.guaranteedDeliveryLevelLabel,
    guaranteed_delivery_window_minutes: context.guaranteedDeliveryWindowMinutes,
    guaranteed_delivery_compensation: context.guaranteedDeliveryCompensation,
    guaranteed_delivery_premium: context.guaranteedDeliveryPremium,
  };
}
