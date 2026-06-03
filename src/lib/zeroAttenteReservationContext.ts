const DEFAULT_ZERO_ATTENTE_TIME = "19:30";
const DEFAULT_ZERO_ATTENTE_PARTY_SIZE = 2;
const MIN_ZERO_ATTENTE_PARTY_SIZE = 1;
const MAX_ZERO_ATTENTE_PARTY_SIZE = 20;

type ZeroAttenteUrlInput = {
  restaurantId?: string | null;
  date?: string | null;
  time?: string | null;
  partySize?: number | string | null;
};

export type ZeroAttenteReservationContext = {
  arrivalDate: string;
  arrivalTime: string;
  partySize: number;
};

function getIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && getIsoDate(parsed) === value;
}

function normalizeArrivalDate(value: string | null, now: Date) {
  const defaultDate = getIsoDate(now);
  if (!value || !isValidCalendarDate(value)) return defaultDate;
  return value >= defaultDate ? value : defaultDate;
}

function normalizeArrivalTime(value: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return DEFAULT_ZERO_ATTENTE_TIME;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return DEFAULT_ZERO_ATTENTE_TIME;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizePartySize(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_ZERO_ATTENTE_PARTY_SIZE;
  if (parsed < MIN_ZERO_ATTENTE_PARTY_SIZE || parsed > MAX_ZERO_ATTENTE_PARTY_SIZE) {
    return DEFAULT_ZERO_ATTENTE_PARTY_SIZE;
  }
  return parsed;
}

export function buildZeroAttenteReservationUrl(input: ZeroAttenteUrlInput) {
  const params = new URLSearchParams();
  const restaurantId = input.restaurantId?.trim();
  const time = normalizeArrivalTime(input.time ?? null);
  const partySize = normalizePartySize(input.partySize);

  if (restaurantId) params.set("restaurant", restaurantId);
  if (input.date && isValidCalendarDate(input.date)) params.set("date", input.date);
  params.set("time", time);
  params.set("party_size", String(partySize));

  const query = params.toString();
  return query ? `/zero-attente?${query}` : "/zero-attente";
}

export function readZeroAttenteReservationContext(
  searchParams: URLSearchParams,
  now = new Date(),
): ZeroAttenteReservationContext {
  return {
    arrivalDate: normalizeArrivalDate(searchParams.get("date"), now),
    arrivalTime: normalizeArrivalTime(searchParams.get("time")),
    partySize: normalizePartySize(searchParams.get("party_size") ?? searchParams.get("partySize")),
  };
}
