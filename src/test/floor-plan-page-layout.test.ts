import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => (
  readFileSync(join(process.cwd(), relativePath), "utf8")
);

describe("floor plan page layout", () => {
  it("keeps the template workspace canvas-first with one tools panel", () => {
    const source = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(source).toContain("xl:grid-cols-[minmax(0,1fr)_360px]");
    expect(source).toContain("value={toolPanelTab}");
    expect(source).toContain('value="library"');
    expect(source).toContain('value="inspector"');
    expect(source).not.toContain("setInspectorTab(");
    expect(source).not.toContain("leftSidebarCollapsed");
    expect(source).not.toContain("rightSidebarCollapsed");
    expect(source).not.toContain("showWorkspaceStats");
    expect(source).not.toContain("leftSheetOpen");
    expect(source).not.toContain("<Sheet");
  });

  it("keeps floor plan panels compact instead of duplicating stat cards", () => {
    const canvas = readSource("src/components/floor-plan/StudioCanvas.tsx");
    const serviceBoard = readSource("src/components/floor-plan/ServiceBoard.tsx");

    expect(canvas).not.toContain("Le canevas garde son scroll local");
    expect(serviceBoard).toContain("Tables {visibleTablesCount}");
    expect(serviceBoard).not.toContain("Tables visibles");
    expect(serviceBoard).not.toContain("Surface de service");
  });

  it("renders right-side tools without nested card shells", () => {
    const palette = readSource("src/components/floor-plan/StudioPalette.tsx");
    const inspector = readSource("src/components/floor-plan/StudioInspector.tsx");

    expect(palette).not.toContain("@/components/ui/card");
    expect(inspector).not.toContain("@/components/ui/card");
  });
});
