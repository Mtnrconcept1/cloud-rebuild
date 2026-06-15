import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => (
  readFileSync(join(process.cwd(), relativePath), "utf8")
);

describe("floor plan page layout", () => {
  it("keeps the template workspace canvas-first with one tools panel", () => {
    const source = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(source).toContain("DockableFloorPlanPanel");
    expect(source).toContain("toolsPanelCollapsed");
    expect(source).toContain("toolsPanelDetached");
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
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(canvas).not.toContain("Le canevas garde son scroll local");
    expect(page).toContain("serviceQueueCollapsed");
    expect(page).toContain("serviceQueueDetached");
    expect(page).toContain("getAutoFitCanvasSize");
    expect(serviceBoard).toContain("Tables {visibleTablesCount}");
    expect(serviceBoard).not.toContain("Tables visibles");
    expect(serviceBoard).not.toContain("Surface de service");
  });

  it("fits the studio canvas to the available block without local canvas scrolling", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const canvas = readSource("src/components/floor-plan/StudioCanvas.tsx");
    const serviceBoard = readSource("src/components/floor-plan/ServiceBoard.tsx");
    const reservationQueue = readSource("src/components/floor-plan/ReservationQueue.tsx");
    const dashboardLayout = readSource("src/components/DashboardLayout.tsx");

    expect(page).toContain('<DashboardLayout contentWidth="full"');
    expect(page).toContain('mainClassName="p-3 pb-24 md:p-4"');
    expect(page).toContain("xl:h-[calc(100vh-2rem)] xl:min-h-0 xl:overflow-hidden");
    expect(page).toContain('cn("h-full min-h-0", className)');
    expect(page).toContain("xl:auto-rows-[minmax(0,1fr)] xl:overflow-hidden");
    expect(dashboardLayout).toContain('contentWidth?: "default" | "full"');
    expect(dashboardLayout).toContain('contentWidth === "full" ? "max-w-none" : "mx-auto max-w-7xl"');
    expect(page).toContain("getAutoFitCanvasSize");
    expect(page).toContain("setCanvasHeight");
    expect(page).toContain("getAutoFitCanvasSize(viewport.clientWidth, viewport.clientHeight)");
    expect(page).toContain("let lastViewportWidth = 0");
    expect(page).toContain("viewport.clientWidth !== lastViewportWidth");
    expect(page).toContain("updateSize(viewport)");
    expect(page).toContain("syncCanvasSizeFromViewport");
    expect(page).toContain("onCanvasViewportResize={syncCanvasSizeFromViewport}");
    expect(page).not.toContain("const canvasRatio = CANVAS_WIDTH / CANVAS_HEIGHT");
    expect(page).not.toContain("canvasRef.current || viewport");
    expect(page).toContain("canvasHeight={canvasHeight}");
    expect(canvas).toContain("canvasHeight");
    expect(serviceBoard).toContain("canvasHeight");
    expect(canvas).toContain("overflow-hidden");
    expect(serviceBoard).toContain("overflow-hidden");
    expect(reservationQueue).toContain("overflow-hidden");
    expect(canvas).toContain("flex h-full min-h-0");
    expect(serviceBoard).toContain("flex h-full min-h-0");
    expect(reservationQueue).toContain("flex h-full min-h-0");
    expect(canvas).toContain("onCanvasViewportResize");
    expect(serviceBoard).toContain("onCanvasViewportResize");
    expect(canvas).toContain("new ResizeObserver(notifySize)");
    expect(serviceBoard).toContain("new ResizeObserver(notifySize)");
    expect(canvas).toContain("h-full w-full");
    expect(serviceBoard).toContain("h-full w-full");
    expect(canvas).not.toContain("overflow-auto");
    expect(serviceBoard).not.toContain("overflow-auto");
    expect(reservationQueue).not.toContain("overflow-auto");
    expect(canvas).not.toContain("const CANVAS_HEIGHT = 760");
  });

  it("renders right-side tools without nested card shells", () => {
    const palette = readSource("src/components/floor-plan/StudioPalette.tsx");
    const inspector = readSource("src/components/floor-plan/StudioInspector.tsx");

    expect(palette).not.toContain("@/components/ui/card");
    expect(inspector).not.toContain("@/components/ui/card");
  });
});
