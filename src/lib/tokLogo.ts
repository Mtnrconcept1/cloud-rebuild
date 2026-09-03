export const DEFAULT_TOK_LOGO_SRC = "/logotok.png";
export const GOLDEN_TOK_LOGO_SRC = "/Image%20Codex%203%20sept.%202026,%2002_31_12.png";
export const TOK_LOGO_TIME_ZONE = "Europe/Zurich";

const zurichDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TOK_LOGO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getZurichDateKey(date = new Date()) {
  const parts = zurichDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function isGoldenTokPath(pathname: string) {
  return pathname === "/chefs-table" || pathname.startsWith("/chefs-table/");
}

export function getTokLogoSrcForPath(pathname: string) {
  return isGoldenTokPath(pathname) ? GOLDEN_TOK_LOGO_SRC : DEFAULT_TOK_LOGO_SRC;
}

export function getTokLogoForDate(date = new Date()) {
  return {
    dateKey: getZurichDateKey(date),
    eventName: null,
    src: DEFAULT_TOK_LOGO_SRC,
  };
}
