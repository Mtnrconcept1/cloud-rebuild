import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = read("supabase/functions/floorplan-ai/index.ts");
// Exercise the actual Edge resolver without importing Deno's remote auth dependencies.
const start = source.search(/(?:async )?function resolveBranchIdFromRestaurant\(/);
const end = source.indexOf("\nasync function getExistingIdempotentResponse(", start);
if (start < 0 || end < 0) throw new Error("Floorplan branch resolver not found");
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Branch = { id: string; restaurant_id: string; is_active: boolean };
const restaurantId = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const foreign = "44444444-4444-4444-8444-444444444444";
const inactive = "55555555-5555-4555-8555-555555555555";
const branches: Branch[] = [
  { id: first, restaurant_id: restaurantId, is_active: true },
  { id: second, restaurant_id: restaurantId, is_active: true },
  { id: foreign, restaurant_id: "66666666-6666-4666-8666-666666666666", is_active: true },
  { id: inactive, restaurant_id: restaurantId, is_active: false },
];
function harness(rows = branches, fail = false) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select(columns: string) { expect(columns).toBe("id"); return query; },
    eq(column: string, value: unknown) { filters.push([column, value]); return query; },
    async limit(count: number) {
      expect(count).toBeLessThanOrEqual(2);
      return fail ? { data: null, error: { message: "internal database detail" } } : {
        data: rows.filter((row) => filters.every(([key, value]) => row[key as keyof Branch] === value))
          .slice(0, count).map(({ id }) => ({ id })),
        error: null,
      };
    },
  };
  const actor = { adminClient: { from(table: string) {
    expect(table).toBe("restaurant_branches"); return query;
  } } };
  const resolver = new Function("HttpError", compiled + ";return resolveBranchIdFromRestaurant;")(HttpError) as
    (restaurant: Record<string, unknown>, actor: unknown, requestedId?: unknown) => Promise<string> | string;
  return { filters, run: async (id?: unknown) => resolver({ id: restaurantId, name: "Test" }, actor, id) };
}

describe("floorplan AI branch authorization", () => {
  it("resolves the explicitly selected active branch without restaurant branch columns", async () => {
    const h = harness();
    await expect(h.run(second)).resolves.toBe(second);
    expect(h.filters).toContainEqual(["restaurant_id", restaurantId]);
    expect(h.filters).toContainEqual(["is_active", true]);
  });
  it("normalizes surrounding whitespace in an explicit branch ID", async () => {
    await expect(harness().run("  " + second + "  ")).resolves.toBe(second);
  });
  it.each([foreign, inactive, "77777777-7777-4777-8777-777777777777"])(
    "rejects foreign, inactive or missing branch %s instead of falling back", async (id) => {
      await expect(harness().run(id)).rejects.toMatchObject({ status: 404, message: "branch_not_found" });
    },
  );
  it.each(["", " ", "invalid", 42, {}, [first]])("rejects malformed explicit branch %j", async (id) => {
    const h = harness();
    await expect(h.run(id)).rejects.toMatchObject({ status: 400, message: "invalid_branch_id" });
    expect(h.filters).toHaveLength(0);
  });
  it.each([undefined, null])("keeps legacy single-active-branch requests compatible (%s)", async (id) => {
    await expect(harness([branches[0], branches[2], branches[3]]).run(id)).resolves.toBe(first);
  });
  it("does not pick an arbitrary branch for a legacy multi-site request", async () => {
    await expect(harness().run()).rejects.toMatchObject({ status: 409, message: "branch_id_missing" });
  });
  it("reports that no active branch is available without creating one", async () => {
    await expect(harness([branches[2], branches[3]]).run()).rejects.toMatchObject({ status: 409, message: "branch_id_missing" });
  });
  it("fails closed with a sanitized error on database lookup failure", async () => {
    await expect(harness(branches, true).run(first)).rejects.toMatchObject({ status: 503, message: "branch_lookup_failed" });
  });
  it("checks restaurant ownership and branch scope before idempotency, credits and provider requests", () => {
    const handler = source.slice(source.indexOf("Deno.serve("));
    const ownerCheck = handler.indexOf("await requireRestaurantAccess(");
    const branchCheck = handler.indexOf("await resolveBranchIdFromRestaurant(");
    expect(ownerCheck).toBeGreaterThan(-1);
    expect(branchCheck).toBeGreaterThan(ownerCheck);
    expect(handler.indexOf("await getExistingIdempotentResponse(")).toBeGreaterThan(branchCheck);
    expect(handler.indexOf("await requireRestaurantTokCreditBalance(")).toBeGreaterThan(branchCheck);
    expect(handler.indexOf("await fetch(OPENAI_URL")).toBeGreaterThan(branchCheck);
  });
  it("wires the selected branch into both dashboard assistant entry points", () => {
    const page = read("src/pages/dashboard/DashboardPlanSalle.tsx");
    for (const component of ["StudioPalette", "FloorPlanAIPanel"]) {
      const opening = page.slice(page.indexOf("<" + component), page.indexOf("<" + component) + 220);
      expect(opening).toContain("branchId={selectedBranch?.id ?? null}");
    }
  });
});
