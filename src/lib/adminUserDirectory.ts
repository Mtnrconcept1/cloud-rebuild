export type AdminDirectoryUser = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  roles: string[] | null;
  created_at?: string | null;
  email_confirmed_at?: string | null;
  account_status?: string | null;
  application_status?: string | null;
  courier_status?: string | null;
  anomalies?: string[] | null;
};

export const DIRECTORY_ROLES = ["client", "restaurateur", "admin", "courier", "commercial"] as const;
export type UserSort = "name_asc" | "name_desc" | "email_asc" | "email_desc" | "city_asc" | "city_desc" | "created_asc" | "created_desc";
type Presence = "all" | "present" | "missing";
export type AdminUserFilters = {
  search: string; roles: string[]; roleMatch: "any" | "all"; sort: UserSort;
  name: string; email: string; city: string; emailDomain: string;
  accountStatus: string; anomaly: string; createdDays: string; createdFrom: string; createdTo: string;
  emailConfirmed: "all" | "yes" | "no";
  namePresence: Presence; emailPresence: Presence; cityPresence: Presence;
  applicationStatus: string; courierStatus: string;
};
export const DEFAULT_USER_FILTERS: AdminUserFilters = {
  search: "", roles: [...DIRECTORY_ROLES], roleMatch: "any", sort: "name_asc",
  name: "", email: "", city: "", emailDomain: "", accountStatus: "all", anomaly: "all",
  createdDays: "all", createdFrom: "", createdTo: "", emailConfirmed: "all",
  namePresence: "all", emailPresence: "all", cityPresence: "all",
  applicationStatus: "all", courierStatus: "all",
};

const normalize = (value: string | null | undefined) =>
  (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-CH");
const collator = new Intl.Collator("fr-CH", { sensitivity: "base", numeric: true });
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
function swissDate(timestamp: number) {
  const parts = dateFormatter.formatToParts(timestamp);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}
function matchesPresence(value: string | null | undefined, filter: Presence) {
  return filter === "all" || (filter === "present" ? Boolean(value?.trim()) : !value?.trim());
}
function matchesStatus(value: string | null | undefined, filter: string) {
  return filter === "all" || (filter === "none" ? !value : value === filter);
}

export function filterAdminUsers<T extends AdminDirectoryUser>(users: readonly T[], filters: AdminUserFilters, now = Date.now()): T[] {
  const words = normalize(filters.search).split(/\s+/).filter(Boolean);
  const domain = normalize(filters.emailDomain).replace(/^@/, "");
  const result = users.filter((user) => {
    // Saved roles only: editing access must not silently alter a marketing segment.
    const roles = user.roles?.length ? user.roles : ["client"];
    if (!filters.roles.length || !(filters.roleMatch === "all"
      ? filters.roles.every((role) => roles.includes(role))
      : filters.roles.some((role) => roles.includes(role)))) return false;
    if (!matchesStatus(user.account_status || "active", filters.accountStatus)) return false;
    if (!matchesStatus(user.application_status, filters.applicationStatus) || !matchesStatus(user.courier_status, filters.courierStatus)) return false;
    const anomalies = user.anomalies || [];
    if (filters.anomaly === "any" ? !anomalies.length : filters.anomaly === "none" ? anomalies.length > 0 : filters.anomaly !== "all" && !anomalies.includes(filters.anomaly)) return false;
    if (filters.emailConfirmed !== "all" && Boolean(user.email_confirmed_at) !== (filters.emailConfirmed === "yes")) return false;
    if (!matchesPresence(user.full_name, filters.namePresence) || !matchesPresence(user.email, filters.emailPresence) || !matchesPresence(user.city, filters.cityPresence)) return false;
    if (!normalize(user.full_name).includes(normalize(filters.name)) || !normalize(user.email).includes(normalize(filters.email)) || !normalize(user.city).includes(normalize(filters.city))) return false;
    if (domain && normalize(user.email).split("@")[1] !== domain) return false;
    if (filters.createdDays !== "all" || filters.createdFrom || filters.createdTo) {
      const created = user.created_at ? Date.parse(user.created_at) : NaN;
      if (!Number.isFinite(created)) return false;
      if (filters.createdDays !== "all" && (created < now - Number(filters.createdDays) * 86400000 || created > now)) return false;
      const day = swissDate(created);
      if (filters.createdFrom && day < filters.createdFrom) return false;
      if (filters.createdTo && day > filters.createdTo) return false;
    }
    const haystack = normalize([user.user_id, user.full_name, user.email, user.city, user.account_status, user.application_status, user.courier_status, ...roles].filter(Boolean).join(" "));
    return words.every((word) => haystack.includes(word));
  });
  const [field, direction] = filters.sort.split("_");
  return result.sort((a, b) => {
    const value = (user: T): string | number => field === "created"
      ? (user.created_at ? Date.parse(user.created_at) || 0 : 0)
      : normalize(field === "name" ? user.full_name : field === "email" ? user.email : user.city);
    const av = value(a), bv = value(b);
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv));
    return comparison * (direction === "desc" ? -1 : 1) || collator.compare(a.user_id, b.user_id);
  });
}

export function serializeAdminCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    // Quoting alone does not stop Excel/LibreOffice from evaluating a formula.
    const firstMeaningful = Array.from(text).find((char) => char.trim() !== "" && char.charCodeAt(0) > 31);
    const unsafe = (firstMeaningful !== undefined && "=+-@".includes(firstMeaningful)) || ["\t", "\r", "\n"].includes(text[0]);
    const safe = unsafe ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n");
}

/** Collect the admin-only RPC result atomically. Never expose a partial export. */
export async function collectAdminUserPages<T extends AdminDirectoryUser>(
  fetchPage: (offset: number, size: number) => Promise<{ rows: T[]; count: number | null }>,
): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  let expectedCount: number | undefined;
  for (let page = 0; page < 200; page++) {
    const { rows, count } = await fetchPage(result.length, 500);
    if (count === null || !Number.isInteger(count) || count < 0 || count > 100000) {
      throw new Error("Le volume de comptes ne permet pas de garantir un export complet.");
    }
    if (expectedCount !== undefined && count !== expectedCount) {
      throw new Error("La liste des comptes a changé. Actualisez avant d'exporter.");
    }
    expectedCount = count;
    for (const user of rows) {
      if (seen.has(user.user_id)) throw new Error("La liste des comptes a changé. Actualisez avant d'exporter.");
      seen.add(user.user_id);
      result.push(user);
    }
    if (result.length === count) return result;
    if (rows.length === 0 || result.length > count) throw new Error("Le chargement des comptes est incomplet. Réessayez.");
  }
  throw new Error("Trop de pages pour cet export. Contactez le support pour un export dédié.");
}
