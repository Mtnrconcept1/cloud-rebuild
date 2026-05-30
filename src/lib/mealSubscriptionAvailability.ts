const FRENCH_DAY_KEYS: Record<string, string[]> = {
  Lundi: ["lundi", "monday"],
  Mardi: ["mardi", "tuesday"],
  Mercredi: ["mercredi", "wednesday"],
  Jeudi: ["jeudi", "thursday"],
  Vendredi: ["vendredi", "friday"],
  Samedi: ["samedi", "saturday"],
  Dimanche: ["dimanche", "sunday"],
};

type OpeningWindow = {
  open?: string;
  close?: string;
  start?: string;
  end?: string;
  start_time?: string;
  end_time?: string;
  closed?: boolean;
};

function parseTime(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getDayValue(openingHours: unknown, day: string) {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return undefined;
  const record = openingHours as Record<string, unknown>;
  const keys = FRENCH_DAY_KEYS[day] || [day.toLowerCase()];
  return keys.map((key) => record[key]).find((value) => typeof value !== "undefined");
}

function parseWindow(value: OpeningWindow) {
  const open = value.open || value.start || value.start_time;
  const close = value.close || value.end || value.end_time;
  return { open, close, closed: value.closed === true };
}

function isTimeInWindow(time: string, window: OpeningWindow) {
  const parsed = parseWindow(window);
  if (parsed.closed) return false;

  const timeMinutes = parseTime(time);
  const openMinutes = parseTime(parsed.open);
  const closeMinutes = parseTime(parsed.close);
  if (timeMinutes === null || openMinutes === null || closeMinutes === null) return true;

  if (closeMinutes < openMinutes) {
    return timeMinutes >= openMinutes || timeMinutes <= closeMinutes;
  }

  return timeMinutes >= openMinutes && timeMinutes <= closeMinutes;
}

function getServiceWindows(openingHours: unknown) {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return [];
  const serviceSettings = (openingHours as Record<string, unknown>).service_settings;
  if (!serviceSettings || typeof serviceSettings !== "object" || Array.isArray(serviceSettings)) return [];

  return Object.values(serviceSettings as Record<string, unknown>)
    .filter((settings): settings is OpeningWindow & { online_booking_enabled?: boolean; service_closed?: boolean } =>
      Boolean(settings && typeof settings === "object" && !Array.isArray(settings)),
    )
    .filter((settings) => settings.online_booking_enabled !== false && settings.service_closed !== true);
}

export function isRestaurantOpenForMealSubscription(
  openingHours: unknown,
  day: string,
  time: string,
) {
  const dayValue = getDayValue(openingHours, day);

  if (dayValue === null) return false;
  if (typeof dayValue === "boolean") {
    if (!dayValue) return false;
    const serviceWindows = getServiceWindows(openingHours);
    return serviceWindows.length > 0 ? serviceWindows.some((window) => isTimeInWindow(time, window)) : true;
  }
  if (typeof dayValue === "string") {
    if (/(ferme|fermee|closed)/i.test(dayValue)) return false;
    const match = /([0-2]\d:[0-5]\d)\s*[-a]\s*([0-2]\d:[0-5]\d)/i.exec(dayValue);
    if (!match) return true;
    return isTimeInWindow(time, { open: match[1], close: match[2] });
  }
  if (Array.isArray(dayValue)) {
    if (dayValue.length === 0) return false;
    return dayValue.some((entry) => entry && typeof entry === "object" && isTimeInWindow(time, entry as OpeningWindow));
  }
  if (dayValue && typeof dayValue === "object") {
    const record = dayValue as OpeningWindow & { open?: boolean };
    if (record.closed === true || record.open === false) return false;
    if (typeof record.open === "boolean") return record.open;
    return isTimeInWindow(time, record);
  }

  const serviceWindows = getServiceWindows(openingHours);
  if (serviceWindows.length > 0) {
    return serviceWindows.some((window) => isTimeInWindow(time, window));
  }

  return true;
}

export function getMealSubscriptionRestaurantAvailability(
  restaurant: { opening_hours?: unknown },
  day: string,
  time: string,
) {
  const isOpen = isRestaurantOpenForMealSubscription(restaurant.opening_hours, day, time);

  return {
    isOpen,
    label: isOpen ? "Disponible" : `Ferme a ${time || "cet horaire"}`,
  };
}
