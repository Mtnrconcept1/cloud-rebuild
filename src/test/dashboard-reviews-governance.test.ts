import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("dashboard reviews governance", () => {
  it("keeps restaurateur reviews read-only and blocks public review fabrication", () => {
    const page = readFileSync(resolve(root, "src/pages/dashboard/DashboardAvis.tsx"), "utf8");

    expect(page).toContain('.from("reviews")');
    expect(page).not.toContain('.from("reviews").insert');
    expect(page).not.toContain('.from("reviews").update');
    expect(page).not.toContain('.from("reviews").delete');
    expect(page).not.toMatch(/user_id:\s*user/i);
    expect(page).not.toMatch(/Cr[ée]er un avis test/i);
    expect(page).not.toContain("Modifier un avis");
  });
});
