const BUSINESS_TIME_ZONE = "Europe/Zurich";

const businessDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type BusinessDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getBusinessParts(value: Date): BusinessDateTimeParts | null {
  if (!Number.isFinite(value.getTime())) return null;

  const parts = Object.fromEntries(
    businessDateTimeFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Partial<BusinessDateTimeParts>;

  if ([parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second]
    .some((part) => !Number.isFinite(part))) return null;

  return parts as BusinessDateTimeParts;
}

export function getBusinessDateKey(value = new Date()): string {
  const parts = getBusinessParts(value);
  if (!parts) return "";
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseBusinessDateTime(dateKey: string, timeValue: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return null;

  const desired: BusinessDateTimeParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] || 0),
  };
  if (desired.month < 1 || desired.month > 12 || desired.day < 1 || desired.day > 31
    || desired.hour > 23 || desired.minute > 59 || desired.second > 59) return null;

  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  let timestamp = desiredAsUtc;

  // Resolve the Europe/Zurich offset without relying on the browser's local zone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getBusinessParts(new Date(timestamp));
    if (!actual) return null;
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    timestamp += desiredAsUtc - actualAsUtc;
  }

  const result = new Date(timestamp);
  const verified = getBusinessParts(result);
  if (!verified || Object.keys(desired).some((key) =>
    verified[key as keyof BusinessDateTimeParts] !== desired[key as keyof BusinessDateTimeParts])) {
    return null;
  }
  return result;
}

export { BUSINESS_TIME_ZONE };
