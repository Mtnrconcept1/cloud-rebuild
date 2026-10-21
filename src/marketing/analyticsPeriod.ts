import { marketingZurichDateBoundaryToIso, marketingZurichDateKey } from "@/marketing/zurichTime";

export type MarketingAnalyticsDateRange = { from?: string; to?: string };

const DAY_MS = 86_400_000;

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftDate(value: string, days: number) {
  return new Date(Date.parse(value + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive Swiss calendar dates, converted to the RPC's half-open UTC interval. */
export function resolveMarketingAnalyticsPeriod(range: MarketingAnalyticsDateRange = {}, now = new Date()) {
  const to = range.to || marketingZurichDateKey(now);
  const from = range.from || (validDateKey(to) ? shiftDate(to, -29) : "");
  let error: string | null = null;
  if (!validDateKey(from) || !validDateKey(to)) error = "Choisissez deux dates valides.";
  else if (from > to) error = "La date de début doit précéder ou égaler la date de fin.";
  else if (Date.parse(to) - Date.parse(from) >= 366 * DAY_MS) error = "Choisissez une période de 366 jours maximum.";
  const fromIso = error ? null : marketingZurichDateBoundaryToIso(from, "start");
  const toIso = error ? null : marketingZurichDateBoundaryToIso(shiftDate(to, 1), "start");
  if (!error && (!fromIso || !toIso)) error = "Les dates choisies ne peuvent pas être interprétées en heure suisse.";
  if (!error && fromIso && toIso && Date.parse(toIso) - Date.parse(fromIso) > 366 * DAY_MS) {
    error = "Choisissez une période de 366 jours maximum.";
  }
  return { from, to, fromIso: error ? null : fromIso, toIso: error ? null : toIso, error };
}
