import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TOK Connect admin - catalog completeness", () => {
  it("counts all restaurants independently of the 1000-row response ceiling", () => {
    const edge = read("supabase/functions/tok-connect-admin/index.ts");
    const ui = read("src/pages/admin/AdminTokConnect.tsx");
    expect(edge).toContain('count: "exact", head: true');
    expect(edge).toContain("restaurantsResult.count ??");
    expect(edge).toContain("enabledCountResult.count ??");
    expect(ui).toContain("overview.restaurant_totals?.enabled");
    expect(ui).toContain("overview.restaurant_totals?.total");
  });

  it("guards the paginated admin-only restaurant search", () => {
    const edge = read("supabase/functions/tok-connect-admin/index.ts");
    expect(edge).toContain('requireRole(actor, ["admin"])');
    expect(edge).toContain('action === "admin-restaurants"');
    expect(edge).toContain('throw new HttpError(400, "invalid_catalog_page")');
    expect(edge).toContain('.range(start, start + CATALOG_PAGE_SIZE - 1)');
    expect(edge).toContain('category === "directory"');
    expect(edge).toContain('access === "revoked"');
  });
});
