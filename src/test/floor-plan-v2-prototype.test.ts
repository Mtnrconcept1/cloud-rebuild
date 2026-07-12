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
    expect(page).toContain('"restaurant_save_floor_plan_workspace"');
    expect(prototype).toContain('const STORAGE_KEY = "tok-table-v2"');
    expect(prototype).not.toContain('const STORAGE_KEY = "tok-table-v1"');
    expect(prototype).not.toContain("supabase");
    expect(prototype).not.toContain("service_role");
  });

  it("offers a touch-friendly furniture library and complete furniture editing", () => {
    const html = readSource("public/tok-table-v2/index.html");
    const prototype = readSource("public/tok-table-v2/app.js");

    expect(html).toContain('id="furniture-library"');
    expect(html).toContain("Mobilier et architecture");
    [
      "wall",
      "door",
      "window",
      "bar",
      "plant",
      "service_station",
      "host_stand",
      "buffet",
      "sofa",
      "divider",
    ].forEach((type) => {
      expect(html).toContain(`data-furniture-type="${type}"`);
    });
    expect(html).toContain('id="furniture-modal"');
    expect(html).toContain('id="furniture-width-input"');
    expect(html).toContain('id="furniture-height-input"');
    expect(html).toContain('id="furniture-rotation-input"');
    expect(html).toContain('id="furniture-locked-input"');
    expect(html).toContain('id="duplicate-furniture-button"');
    expect(html).toContain('id="delete-furniture-button"');
    expect(prototype).toContain("FURNITURE_LIBRARY");
    expect(prototype).toContain("addFurniture");
    expect(prototype).toContain("openFurnitureModal");
    expect(prototype).toMatch(/tok-table-v2:save-template[\s\S]{0,500}objects/);
  });

  it("makes table capacity explicit and explains immediate client placement persistence", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");
    const html = readSource("public/tok-table-v2/index.html");
    const prototype = readSource("public/tok-table-v2/app.js");

    expect(html).toContain('id="capacity-decrease-button"');
    expect(html).toContain('id="table-capacity-input"');
    expect(html).toContain('id="capacity-increase-button"');
    expect(prototype).toContain("capacityDecreaseButton");
    expect(prototype).toContain("capacityIncreaseButton");

    expect(html).toContain('id="assignment-autosave-note"');
    expect(html).toContain("Placements enregistrés automatiquement");
    expect(html).toContain("Chaque placement, déplacement ou retrait est sauvegardé immédiatement.");
    expect(prototype).toContain('postToDashboard("tok-table-v2:assign"');
    expect(page).toContain('"restaurant_save_floor_plan_assignments"');
    expect(page).toContain("p_assignments: changes");
  });
});
