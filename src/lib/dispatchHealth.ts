export type DispatchHealthRow = {
  id?: string | null;
  status?: string | null;
  created_at?: string | null;
  courier_id?: string | null;
};

export type DispatchHealthSummary = {
  searchingOverTenMinutes: number;
  activeWithoutCourier: number;
  healthy: boolean;
  affectedIds: string[];
};

const ACTIVE_DISPATCH_STATUSES = new Set([
  "assigned",
  "accepted",
  "pickup",
  "picked_up",
  "en_route",
  "delivering",
  "in_progress",
]);

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function minutesBetween(left: Date, right: Date) {
  return (right.getTime() - left.getTime()) / 60000;
}

function stableId(row: DispatchHealthRow, index: number) {
  return row.id || `job-${index + 1}`;
}

export function summarizeDispatchHealth(
  rows: DispatchHealthRow[],
  now = new Date(),
): DispatchHealthSummary {
  const affectedIds = new Set<string>();
  let searchingOverTenMinutes = 0;
  let activeWithoutCourier = 0;

  rows.forEach((row, index) => {
    const id = stableId(row, index);
    const status = normalize(row.status);
    const createdAt = row.created_at ? new Date(row.created_at) : null;

    if (
      status === "searching" &&
      createdAt &&
      !Number.isNaN(createdAt.getTime()) &&
      minutesBetween(createdAt, now) > 10
    ) {
      searchingOverTenMinutes += 1;
      affectedIds.add(id);
    }

    if (ACTIVE_DISPATCH_STATUSES.has(status) && !String(row.courier_id || "").trim()) {
      activeWithoutCourier += 1;
      affectedIds.add(id);
    }
  });

  return {
    searchingOverTenMinutes,
    activeWithoutCourier,
    healthy: searchingOverTenMinutes === 0 && activeWithoutCourier === 0,
    affectedIds: Array.from(affectedIds),
  };
}
