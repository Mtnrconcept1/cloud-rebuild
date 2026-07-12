import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("floor plan v2", () => {
  it("exposes a separate protected dashboard route without replacing v1", () => {
    const app = readSource("src/App.tsx");
    const navigation = readSource("src/components/DashboardLayout.tsx");

    expect(app).toContain('import("./pages/dashboard/DashboardPlanSalleV2")');
    expect(app).toContain('path="/dashboard/plan-salle-v2"');
    expect(app).toContain("<DashboardPlanSalleV2 />");
    expect(app).toContain('path="/dashboard/plan-salle"');
    expect(app).toContain("<DashboardPlanSalle />");

    expect(navigation).toContain('to: "/dashboard/plan-salle-v2"');
    expect(navigation).toContain('label: "Plan de salle 2"');
    expect(navigation).toContain('feature: "dashboard-plan-salle"');
  });

  it("keeps the iframe isolated from credentials while sharing official assignments with v1", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");
    const prototype = readSource("public/tok-table-v2/app.js");

    expect(page).toContain('src={PROTOTYPE_URL}');
    expect(page).toContain("partagés avec la V1");
    expect(page).toContain('"restaurant_save_floor_plan_assignments"');
    expect(page).toContain('"restaurant_save_floor_plan_template"');
    expect(prototype).toContain('const STORAGE_KEY = "tok-table-v2"');
    expect(prototype).not.toContain('const STORAGE_KEY = "tok-table-v1"');
    expect(prototype).not.toContain("supabase");
    expect(prototype).not.toContain("service_role");
  });
});
