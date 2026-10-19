/** A date-only route parameter must name a real calendar day. */
export function isValidServiceDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return false;
  const actual = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  return actual === value;
}

export function buildFloorPlanHref({
  date,
  branchId,
  reservationId,
  service,
}: {
  date?: string | null;
  branchId?: string | null;
  reservationId?: string | null;
  service?: string | null;
} = {}) {
  const params = new URLSearchParams();
  if (isValidServiceDate(date)) params.set("date", date);
  if (branchId?.trim()) params.set("branch", branchId.trim());
  if (reservationId?.trim()) params.set("reservation", reservationId.trim());
  if (service === "lunch" || service === "dinner") params.set("service", service);
  const query = params.toString();
  return `/dashboard/plan-salle${query ? `?${query}` : ""}`;
}
