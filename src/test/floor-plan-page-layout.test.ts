import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => (
  readFileSync(join(process.cwd(), relativePath), "utf8")
);

describe("floor plan page layout", () => {
  it("keeps the daily service focused on the plan and one compact client list", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const queue = readSource("src/components/floor-plan/SimpleReservationQueue.tsx");

    expect(page).toContain("<ServiceBoard");
    expect(page).toContain("<SimpleReservationQueue");
    expect(page).toContain("Placer automatiquement");
    expect(page).toContain('id="floor-plan-reservation-queue"');
    expect(page).not.toContain("<DockableFloorPlanPanel");
    expect(queue).toContain("À placer");
    expect(queue).toContain("recommendedTablesByReservationId");
    expect(queue).not.toContain("Timeline");
    expect(queue).not.toContain("Détacher");
    expect(queue).not.toContain("Replier");
  });

  it("keeps configuration canvas-first with only add and settings tabs", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(page).toContain("<StudioCanvas");
    expect(page).toContain("<StudioPalette");
    expect(page).toContain("<StudioInspector");
    expect(page).toContain('value="library"');
    expect(page).toContain('value="inspector"');
    expect(page).toContain('id="floor-plan-studio-tools"');
    expect(page).not.toContain("Sauver variante");
    expect(page).not.toContain("Aperçu");
  });

  it("retains the responsive full-width canvas and safe touch interactions", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const canvas = readSource("src/components/floor-plan/StudioCanvas.tsx");
    const serviceBoard = readSource("src/components/floor-plan/ServiceBoard.tsx");
    const queue = readSource("src/components/floor-plan/SimpleReservationQueue.tsx");

    expect(page).toContain('<DashboardLayout contentWidth="full"');
    expect(page).toContain('mainClassName="p-2 pb-24 sm:p-3 md:p-4"');
    expect(page).toContain("xl:h-[calc(100vh-2rem)] xl:min-h-0 xl:overflow-hidden");
    expect(page).toContain("xl:auto-rows-[minmax(0,1fr)] xl:overflow-hidden");
    expect(page).toContain("syncCanvasSizeFromViewport");
    expect(page).toContain("onCanvasViewportResize={syncCanvasSizeFromViewport}");
    expect(page).toContain("revealResponsivePanel");
    expect(page).toContain("Clients ({unassignedVisibleReservations.length} à placer)");
    expect(canvas).toContain("new ResizeObserver(notifySize)");
    expect(serviceBoard).toContain("new ResizeObserver(notifySize)");
    expect(serviceBoard).toContain("touch-manipulation");
    expect(queue).toContain('role="button"');
    expect(queue).toContain("onReservationHandlePointerDown");
  });

  it("preserves the floor plan persistence and assignment contracts", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(page).toContain("restaurant_save_floor_plan_assignments");
    expect(page).toContain("getReservationDropStateForAssignments");
    expect(page).toContain("reservationsOverlap");
    expect(page).toContain("scoreReservationPlacement");
    expect(page).toContain("saveMutation.mutate");
    expect(page).toContain("lastAutoSavedLayoutSignatureRef");
  });
});
