export type ReservationInventoryRow = {
  id: string;
  restaurant_id?: string | null;
  date?: string | null;
  time?: string | null;
  table_id?: string | null;
  status?: string | null;
};

export type ReservationInventoryConflict = {
  key: string;
  reservationIds: string[];
};

export type ReservationInventoryHealthSummary = {
  overbookedTables: number;
  healthy: boolean;
  conflicts: ReservationInventoryConflict[];
};

const ACTIVE_RESERVATION_STATUSES = new Set(["confirmed", "arrived", "pending", "seated"]);

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTime(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, 5);
}

export function summarizeReservationInventoryHealth(
  rows: ReservationInventoryRow[],
): ReservationInventoryHealthSummary {
  const reservationsBySlot = new Map<string, string[]>();

  for (const row of rows) {
    const status = normalize(row.status);
    const tableId = String(row.table_id || "").trim();
    const restaurantId = String(row.restaurant_id || "").trim();
    const date = String(row.date || "").trim();
    const time = normalizeTime(row.time);

    if (!ACTIVE_RESERVATION_STATUSES.has(status) || !tableId || !restaurantId || !date || !time) {
      continue;
    }

    const key = `${restaurantId}|${date}|${time}|${tableId}`;
    reservationsBySlot.set(key, [...(reservationsBySlot.get(key) || []), row.id]);
  }

  const conflicts = Array.from(reservationsBySlot.entries())
    .filter(([, reservationIds]) => reservationIds.length > 1)
    .map(([key, reservationIds]) => ({ key, reservationIds }));

  return {
    overbookedTables: conflicts.length,
    healthy: conflicts.length === 0,
    conflicts,
  };
}
