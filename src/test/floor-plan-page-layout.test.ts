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
    expect(page).toContain('aria-label="Sauver variante"');
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
    expect(queue).toContain('<button');
    expect(queue).toContain('aria-label={`Ouvrir la réservation de ${customerName}`}');
    expect(queue).toContain("onReservationHandlePointerDown");

    // The surrounding UI follows the dashboard theme; both canvases share
    // the deliberately light sheet documented in plan-de-salle-theme.md.
    for (const source of [page, serviceBoard, queue]) {
      expect(source).toContain("FLOOR_PLAN_TONE_CLASS");
      expect(source).toContain("bg-card");
      expect(source).toContain("border-border");
    }
    expect(canvas).toContain('from "./floorPlanSheet"');
    expect(serviceBoard).toContain('from "./floorPlanSheet"');
  });

  it("does not re-arm an auto-save the server already refused", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    // A server refusal is deterministic, and the auto-save effect depends on
    // the mutation while the draft stays dirty. Forgetting the refused
    // signature would replay the same doomed save every 900ms and bury the
    // restaurateur under destructive toasts.
    const errorHandler = page.slice(page.indexOf("onError: (error: Error, options) => {"));
    const errorHandlerBody = errorHandler.slice(0, errorHandler.indexOf("toast({"));

    expect(errorHandlerBody).toContain("lastAutoSavedLayoutSignatureRef.current = options.layoutSignature ?? null;");
    expect(errorHandlerBody).not.toContain("lastAutoSavedLayoutSignatureRef.current = null;");
    // Switching branch, date or edit mode must still forget it: that is a new
    // context, not a refused one.
    expect(page).toContain("}, [editMode, referenceDate, selectedBranchId]);");
  });

  // Save failures, draft tracking and editing-mode transitions are exercised
  // through the real page in floor-plan-service-workspace.test.tsx.
});
