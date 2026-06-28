export const DEFAULT_TOK_LOGO_SRC = "/logotok.png";
export const TOK_LOGO_TIME_ZONE = "Europe/Zurich";

export type TokEventLogo = {
  id: number;
  eventName: string;
  src: string;
  dates: readonly string[];
};

const annual = (monthDay: string) => [`2026-${monthDay}`, `2027-${monthDay}`, `2028-${monthDay}`] as const;

export const TOK_EVENT_LOGOS: readonly TokEventLogo[] = [
  { id: 1, eventName: "Jeux olympiques", src: "/event-logos/logotok1.webp", dates: ["2026-02-06", "2028-07-14"] },
  { id: 2, eventName: "Euro de football", src: "/event-logos/logotok2.webp", dates: ["2028-06-09"] },
  { id: 3, eventName: "Coupe du monde de football", src: "/event-logos/logotok3.webp", dates: ["2026-06-11"] },
  { id: 4, eventName: "Roland-Garros", src: "/event-logos/logotok4.webp", dates: ["2026-05-24", "2027-05-23", "2028-05-28"] },
  { id: 5, eventName: "Wimbledon", src: "/event-logos/logotok5.webp", dates: ["2026-06-29", "2027-06-28", "2028-07-03"] },
  { id: 6, eventName: "Tour de France", src: "/event-logos/logotok6.webp", dates: ["2026-07-04", "2027-07-03", "2028-06-24"] },
  { id: 7, eventName: "Super Bowl", src: "/event-logos/logotok7.webp", dates: ["2026-02-08", "2027-02-14", "2028-02-13"] },
  { id: 8, eventName: "Finale de Ligue des champions", src: "/event-logos/logotok8.webp", dates: ["2026-05-30", "2027-06-05", "2028-05-27"] },
  { id: 9, eventName: "Grand Prix de Monaco", src: "/event-logos/logotok9.webp", dates: ["2026-06-07", "2027-06-06", "2028-06-04"] },
  { id: 10, eventName: "NBA Finals", src: "/event-logos/logotok10.webp", dates: ["2026-06-03", "2027-06-03", "2028-06-01"] },
  { id: 11, eventName: "Eurovision", src: "/event-logos/logotok11.webp", dates: ["2026-05-12", "2027-05-11", "2028-05-09"] },
  { id: 12, eventName: "Festival de Cannes", src: "/event-logos/logotok12.webp", dates: ["2026-05-12", "2027-05-11", "2028-05-09"] },
  { id: 13, eventName: "Fete de la musique", src: "/event-logos/logotok13.webp", dates: annual("06-21") },
  { id: 14, eventName: "Carnaval de Rio", src: "/event-logos/logotok14.webp", dates: ["2026-02-13", "2027-02-05", "2028-02-25"] },
  { id: 15, eventName: "Carnaval de Venise", src: "/event-logos/logotok15.webp", dates: ["2026-01-31", "2027-01-23", "2028-02-12"] },
  { id: 16, eventName: "Oktoberfest", src: "/event-logos/logotok16.webp", dates: ["2026-09-19", "2027-09-18", "2028-09-16"] },
  { id: 17, eventName: "Saint-Patrick", src: "/event-logos/logotok17.webp", dates: annual("03-17") },
  { id: 18, eventName: "Fete des Lumieres de Lyon", src: "/event-logos/logotok18.webp", dates: ["2026-12-05", "2027-12-08", "2028-12-08"] },
  { id: 19, eventName: "Fete nationale suisse", src: "/event-logos/logotok19.webp", dates: annual("08-01") },
  { id: 20, eventName: "Fete nationale francaise", src: "/event-logos/logotok20.webp", dates: annual("07-14") },
  { id: 21, eventName: "Noel", src: "/event-logos/logotok21.webp", dates: annual("12-25") },
  { id: 22, eventName: "Nouvel An", src: "/event-logos/logotok22.webp", dates: annual("01-01") },
  { id: 23, eventName: "Paques", src: "/event-logos/logotok23.webp", dates: ["2026-04-05", "2027-03-28", "2028-04-16"] },
  { id: 24, eventName: "Halloween", src: "/event-logos/logotok24.webp", dates: annual("10-31") },
  { id: 25, eventName: "Saint-Valentin", src: "/event-logos/logotok25.webp", dates: annual("02-14") },
  { id: 26, eventName: "Fete des rois / Epiphanie", src: "/event-logos/logotok26.webp", dates: annual("01-06") },
  { id: 27, eventName: "Mardi gras", src: "/event-logos/logotok27.webp", dates: ["2026-02-17", "2027-02-09", "2028-02-29"] },
  { id: 28, eventName: "Thanksgiving", src: "/event-logos/logotok28.webp", dates: ["2026-11-26", "2027-11-25", "2028-11-23"] },
  { id: 29, eventName: "Dia de los Muertos", src: "/event-logos/logotok29.webp", dates: annual("11-01") },
  { id: 30, eventName: "Nouvel An chinois", src: "/event-logos/logotok30.webp", dates: ["2026-02-17", "2027-02-06", "2028-01-26"] },
  { id: 31, eventName: "Premier pas sur la Lune", src: "/event-logos/logotok31.webp", dates: annual("07-20") },
  { id: 32, eventName: "Chute du mur de Berlin", src: "/event-logos/logotok32.webp", dates: annual("11-09") },
  { id: 33, eventName: "Attentats du 11 septembre", src: "/event-logos/logotok33.webp", dates: annual("09-11") },
  { id: 34, eventName: "Fin de la Seconde Guerre mondiale en Europe", src: "/event-logos/logotok34.webp", dates: annual("05-08") },
  { id: 35, eventName: "Debarquement de Normandie", src: "/event-logos/logotok35.webp", dates: annual("06-06") },
  { id: 36, eventName: "Revolution francaise", src: "/event-logos/logotok36.webp", dates: annual("07-14") },
  { id: 37, eventName: "Independance americaine", src: "/event-logos/logotok37.webp", dates: annual("07-04") },
  { id: 38, eventName: "Abolition de l'esclavage en France", src: "/event-logos/logotok38.webp", dates: annual("04-27") },
  { id: 39, eventName: "Chute de l'Empire romain d'Occident", src: "/event-logos/logotok39.webp", dates: annual("09-04") },
  { id: 40, eventName: "Decouverte de l'Amerique par Christophe Colomb", src: "/event-logos/logotok40.webp", dates: annual("10-12") },
  { id: 41, eventName: "Invention de l'imprimerie", src: "/event-logos/logotok41.webp", dates: annual("02-23") },
  { id: 42, eventName: "Naissance d'Internet", src: "/event-logos/logotok42.webp", dates: annual("01-01") },
  { id: 43, eventName: "Lancement du premier iPhone", src: "/event-logos/logotok43.webp", dates: annual("01-09") },
  { id: 44, eventName: "Premiere projection publique de cinema des freres Lumiere", src: "/event-logos/logotok44.webp", dates: annual("12-28") },
  { id: 45, eventName: "Anniversaire de Leonard de Vinci", src: "/event-logos/logotok45.webp", dates: annual("04-15") },
  { id: 46, eventName: "Anniversaire d'Albert Einstein", src: "/event-logos/logotok46.webp", dates: annual("03-14") },
  { id: 47, eventName: "Journee de la Terre", src: "/event-logos/logotok47.webp", dates: annual("04-22") },
  { id: 48, eventName: "Journee internationale des droits des femmes", src: "/event-logos/logotok48.webp", dates: annual("03-08") },
  { id: 49, eventName: "Journee mondiale de l'alimentation", src: "/event-logos/logotok49.webp", dates: annual("10-16") },
  { id: 50, eventName: "Fete de Geneve", src: "/event-logos/logotok50.webp", dates: ["2026-08-08", "2027-08-07", "2028-08-05"] },
];

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

export function getTokLogoForDate(date = new Date()) {
  const dateKey = getZurichDateKey(date);
  const eventLogo = TOK_EVENT_LOGOS.find((logo) => logo.dates.includes(dateKey));

  return {
    dateKey,
    eventName: eventLogo?.eventName ?? null,
    src: eventLogo?.src ?? DEFAULT_TOK_LOGO_SRC,
  };
}

export function getNextZurichDayDelayMs(now = new Date()) {
  const currentDateKey = getZurichDateKey(now);
  const nowMs = now.getTime();
  let low = nowMs + 1;
  let high = nowMs + 36 * 60 * 60 * 1000;

  while (getZurichDateKey(new Date(high)) === currentDateKey) {
    high += 12 * 60 * 60 * 1000;
  }

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getZurichDateKey(new Date(mid)) === currentDateKey) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.max(1_000, high - nowMs + 250);
}
