export const MARKETING_TIME_ZONE = "Europe/Zurich";

type ZurichDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const zurichPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MARKETING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function partsAt(value: Date | number): ZurichDateParts {
  const parts = Object.fromEntries(
    zurichPartsFormatter
      .formatToParts(typeof value === "number" ? new Date(value) : value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function offsetAt(timestamp: number) {
  const parts = partsAt(timestamp);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(timestamp / 1_000) * 1_000;
}

export function marketingZurichLocalDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const requested = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  const nominalUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
    requested.second,
  );
  let candidate = nominalUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    candidate = nominalUtc - offsetAt(candidate);
  }
  const resolved = partsAt(candidate);
  const valid = Object.entries(requested).every(([key, item]) => (
    resolved[key as keyof ZurichDateParts] === item
  ));
  return valid ? new Date(candidate).toISOString() : null;
}

export function marketingZurichDateBoundaryToIso(dateKey: string, edge: "start" | "end") {
  const base = marketingZurichLocalDateTimeToIso(`${dateKey}T${edge === "start" ? "00:00:00" : "23:59:59"}`);
  if (!base || edge === "start") return base;
  return new Date(new Date(base).getTime() + 999).toISOString();
}

export function marketingZurichDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = partsAt(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function marketingZurichDateTimeInput(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = partsAt(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function marketingMonthRange(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function currentMarketingMonthRange(now = new Date()) {
  return marketingMonthRange(marketingZurichDateKey(now)) as { from: string; to: string };
}
