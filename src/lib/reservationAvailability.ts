import {
  generateTimeSlotsForService,
  parseServiceTime,
  SERVICE_PERIOD_LABELS,
  type ServicePeriod,
  type ServiceSettings,
  type ServiceSettingsMap,
} from "@/lib/serviceSettings";

export type ReservationSlotAvailability = {
  time: string;
  service: ServicePeriod;
  capacity: number;
  reservedTables: number;
  remainingTables: number;
  available: boolean;
  disabledReason: string | null;
};

export type ReservationSlotGroup = {
  service: ServicePeriod;
  label: string;
  slots: ReservationSlotAvailability[];
};

type BuildReservationSlotGroupsInput = {
  serviceSettings: ServiceSettingsMap;
  selectedDate: Date | null | undefined;
  reservedTablesByTime?: Record<string, number>;
  now?: Date;
};

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameCalendarDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function buildDateTime(date: Date, time: string) {
  const minutes = parseServiceTime(time);
  const next = new Date(date);
  if (minutes === null) return next;
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

export function isReservationCalendarDateDisabled(value: Date, now = new Date()) {
  return startOfDay(value).getTime() < startOfDay(now).getTime();
}

export function getSlotCapacityForTime(time: string, settings: ServiceSettings) {
  const slot = parseServiceTime(time);
  if (slot === null) return settings.max_tables_per_slot;

  const matchingWindow = settings.slot_capacity_windows.find((window) => {
    const start = parseServiceTime(window.start_time);
    const end = parseServiceTime(window.end_time);
    return start !== null && end !== null && slot >= start && slot <= end;
  });

  return matchingWindow?.max_tables ?? settings.max_tables_per_slot;
}

export function buildReservationSlotGroups({
  serviceSettings,
  selectedDate,
  reservedTablesByTime = {},
  now = new Date(),
}: BuildReservationSlotGroupsInput): ReservationSlotGroup[] {
  if (!selectedDate || isReservationCalendarDateDisabled(selectedDate, now)) return [];

  return (["lunch", "dinner"] as ServicePeriod[])
    .map((service) => {
      const settings = serviceSettings[service];
      const serviceTimes = generateTimeSlotsForService(settings);
      const serviceReservedTables = serviceTimes.reduce((total, time) => (
        total + Math.max(0, Math.floor(Number(reservedTablesByTime[time] || 0)))
      ), 0);
      const slots = serviceTimes.filter((time) => {
        if (!isSameCalendarDay(selectedDate, now)) return true;
        return buildDateTime(selectedDate, time).getTime() > now.getTime();
      });

      return {
        service,
        label: SERVICE_PERIOD_LABELS[service],
        slots: slots.map((time) => {
          const capacity = Math.max(0, getSlotCapacityForTime(time, settings));
          const reservedTables = serviceReservedTables;
          const remainingTables = Math.max(0, capacity - reservedTables);
          const available = capacity > 0 && remainingTables > 0;

          return {
            time,
            service,
            capacity,
            reservedTables,
            remainingTables,
            available,
            disabledReason: available ? null : "Complet",
          };
        }),
      };
    })
    .filter((group) => group.slots.length > 0);
}
