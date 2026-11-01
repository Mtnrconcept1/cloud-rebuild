import { describe, expect, it } from "vitest";
import { DEFAULT_USER_FILTERS, filterAdminUsers, serializeAdminCsv, collectAdminUserPages, type AdminDirectoryUser, type AdminUserFilters } from "@/lib/adminUserDirectory";

const users: AdminDirectoryUser[] = [
  { user_id: "b", full_name: "Zoé 10", email: "zoe@example.ch", city: "Genève", roles: ["client", "restaurateur"], created_at: "2026-10-31T23:30:00Z", email_confirmed_at: "2026-11-01", account_status: "active", application_status: "approved", courier_status: null, anomalies: [] },
  { user_id: "a", full_name: "Émile 2", email: "emile@tok.ch", city: "Vernier", roles: ["commercial"], created_at: "2026-10-01T12:00:00Z", account_status: "suspended", application_status: "pending_review", courier_status: "pending_approval", anomalies: ["account_suspended"] },
  { user_id: "c", full_name: null, email: null, city: null, roles: ["courier"], created_at: null, anomalies: [] },
];
const filter = (patch: Partial<AdminUserFilters> = {}) => filterAdminUsers(users, { ...DEFAULT_USER_FILTERS, ...patch }, Date.parse("2026-11-01T12:00:00Z"));
const ids = (patch: Partial<AdminUserFilters>) => filter(patch).map((user) => user.user_id);

describe("admin user segmentation", () => {
  it("sorts French names A–Z with missing names last without mutating data", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(users.map((user) => user.user_id)).toEqual(["b", "a", "c"]);
  });
  it("sorts names Z–A and keeps missing names last", () => expect(ids({ sort: "name_desc" })).toEqual(["b", "a", "c"]));
  it("sorts dates and email", () => {
    expect(ids({ sort: "created_asc" })).toEqual(["a", "b", "c"]);
    expect(ids({ sort: "created_desc" })).toEqual(["b", "a", "c"]);
    expect(ids({ sort: "email_asc" })).toEqual(["a", "b", "c"]);
  });
  it("combines selected roles with OR by default", () => expect(ids({ roles: ["commercial", "restaurateur"] })).toEqual(["a", "b"]));
  it("can require all selected roles", () => expect(ids({ roles: ["client", "restaurateur"], roleMatch: "all" })).toEqual(["b"]));
  it("shows no accounts when all role checkboxes are cleared", () => expect(ids({ roles: [] })).toEqual([]));
  it("uses saved roles rather than role drafts", () => {
    const draft = { ...users[0], effectiveRoles: ["admin"] };
    expect(filterAdminUsers([draft], { ...DEFAULT_USER_FILTERS, roles: ["admin"] })).toEqual([]);
  });
  it("ignores accents and matches all search words across fields", () => expect(ids({ search: "geneve zoe" })).toEqual(["b"]));
  it("combines independent name, city and email filters", () => expect(ids({ name: "emile", city: "ver", email: "tok" })).toEqual(["a"]));
  it("matches an exact email domain", () => {
    expect(ids({ emailDomain: "@TOK.CH" })).toEqual(["a"]);
    expect(ids({ emailDomain: "ch" })).toEqual([]);
  });
  it("filters confirmed and unconfirmed emails", () => {
    expect(ids({ emailConfirmed: "yes" })).toEqual(["b"]);
    expect(ids({ emailConfirmed: "no" })).toEqual(["a", "c"]);
  });
  it("filters missing profile fields", () => {
    expect(ids({ cityPresence: "missing", emailPresence: "missing", namePresence: "missing" })).toEqual(["c"]);
    expect(ids({ cityPresence: "present" })).toEqual(["a", "b"]);
  });
  it("combines account, application and courier statuses", () => expect(ids({ accountStatus: "suspended", applicationStatus: "pending_review", courierStatus: "pending_approval" })).toEqual(["a"]));
  it("finds absent applications or courier profiles", () => expect(ids({ applicationStatus: "none", courierStatus: "none" })).toEqual(["c"]));
  it("filters anomalies present, absent or by code", () => {
    expect(ids({ anomaly: "any" })).toEqual(["a"]);
    expect(ids({ anomaly: "none" })).toEqual(["b", "c"]);
    expect(ids({ anomaly: "account_suspended" })).toEqual(["a"]);
  });
  it("uses inclusive Swiss calendar dates across UTC midnight", () => {
    expect(ids({ createdFrom: "2026-11-01", createdTo: "2026-11-01" })).toEqual(["b"]);
    expect(ids({ createdFrom: "2026-11-02", createdTo: "2026-11-01" })).toEqual([]);
  });
  it("combines rolling period and custom dates and excludes unknown dates", () => {
    expect(ids({ createdDays: "7" })).toEqual(["b"]);
    expect(ids({ createdDays: "7", createdTo: "2026-10-31" })).toEqual([]);
  });
});
describe("CSV safety and fidelity", () => {
  it("preserves accents, quotes, commas and line breaks with a UTF-8 BOM", () => {
    expect(serializeAdminCsv([["Nom", "Ville"], ['Émile, dit "E"', "Genève\nCentre"]])).toBe('\uFEFF"Nom","Ville"\r\n"Émile, dit ""E""","Genève\nCentre"');
  });
  it("neutralizes spreadsheet formulas including leading whitespace and controls", () => {
    for (const value of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1"]) {
      expect(serializeAdminCsv([[value]])).toBe('\uFEFF"' + "'" + value + '"');
    }
  });
  it("exports the full filtered result in its sorted order", () => {
    const rows = filter({ roles: ["commercial", "restaurateur"] });
    expect(serializeAdminCsv(rows.map((user) => [user.user_id, user.full_name]))).toBe('\uFEFF"a","Émile 2"\r\n"b","Zoé 10"');
  });
});

describe("complete paginated directory loading", () => {
  it("reads every page even when the server caps a response below the requested size", async () => {
    const offsets: number[] = [];
    const rows = await collectAdminUserPages(async (offset) => {
      offsets.push(offset);
      return { rows: users.slice(offset, offset + 1), count: users.length };
    });
    expect(offsets).toEqual([0, 1, 2]);
    expect(rows).toEqual(users);
  });
  it("fails instead of exporting a partial list when the next page fails", async () => {
    await expect(collectAdminUserPages(async (offset) => {
      if (offset) throw new Error("Accès refusé");
      return { rows: [users[0]], count: 3 };
    })).rejects.toThrow("Accès refusé");
  });
  it("rejects changed totals, duplicate rows and unexpected empty pages", async () => {
    await expect(collectAdminUserPages(async (offset) => ({ rows: [users[offset ? 1 : 0]], count: offset ? 2 : 3 }))).rejects.toThrow();
    await expect(collectAdminUserPages(async () => ({ rows: [users[0]], count: 3 }))).rejects.toThrow();
    await expect(collectAdminUserPages(async () => ({ rows: [], count: 3 }))).rejects.toThrow();
  });
  it("supports an empty directory and rejects unavailable counts or excessive volumes", async () => {
    await expect(collectAdminUserPages(async () => ({ rows: [], count: 0 }))).resolves.toEqual([]);
    await expect(collectAdminUserPages(async () => ({ rows: [], count: null }))).rejects.toThrow();
    await expect(collectAdminUserPages(async () => ({ rows: [], count: 100001 }))).rejects.toThrow();
  });
});
