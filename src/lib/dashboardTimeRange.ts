export type DashboardTimeRange = "day" | "week" | "month" | "year" | "all";

export const DASHBOARD_TIME_RANGE_OPTIONS: Array<{
  value: DashboardTimeRange;
  label: string;
}> = [
  { value: "day", label: "Jour" },
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
  { value: "year", label: "Annee" },
  { value: "all", label: "Toutes" },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isDateOnlyString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getTodayReferenceDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseLocalDateOnly(value: string) {
  if (!isDateOnlyString(value)) return new Date(value);

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function normalizeDate(value: string | Date, dateOnly = false) {
  if (value instanceof Date) return new Date(value);
  return dateOnly || isDateOnlyString(value) ? parseLocalDateOnly(value) : new Date(value);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
}

function addYears(date: Date, years: number) {
  return new Date(date.getFullYear() + years, 0, 1, 0, 0, 0, 0);
}

export function getDashboardTimeRangeBounds(referenceDateValue: string, range: DashboardTimeRange) {
  if (range === "all") return null;

  const referenceDate = parseLocalDateOnly(referenceDateValue);
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  switch (range) {
    case "day":
      return { start, end: addDays(start, 1) };
    case "week": {
      const diffToMonday = (start.getDay() + 6) % 7;
      const weekStart = addDays(start, -diffToMonday);
      return { start: weekStart, end: addDays(weekStart, 7) };
    }
    case "month": {
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1, 0, 0, 0, 0);
      return { start: monthStart, end: addMonths(monthStart, 1) };
    }
    case "year": {
      const yearStart = new Date(start.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { start: yearStart, end: addYears(yearStart, 1) };
    }
    default:
      return null;
  }
}

export function isDateInDashboardTimeRange(
  value: string | Date,
  range: DashboardTimeRange,
  referenceDateValue: string,
  options?: { dateOnly?: boolean },
) {
  const bounds = getDashboardTimeRangeBounds(referenceDateValue, range);
  if (!bounds) return true;

  const candidate = normalizeDate(value, options?.dateOnly);
  return candidate >= bounds.start && candidate < bounds.end;
}

export function formatDashboardDateHeading(value: string | Date) {
  const date = normalizeDate(value, true);
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
