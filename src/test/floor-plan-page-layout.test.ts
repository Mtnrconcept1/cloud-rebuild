import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { getFloorPlanContainScale } from "@/components/floor-plan/useFloorPlanZoomViewport";

// Source-contract checks ignore formatting; behavior is exercised by the
// dashboard integration and component tests.
function expectCode(source: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
  const contains = (fragment: string) =>
    normalize(source).includes(normalize(fragment));
  return {
    toContain: (fragment: string) =>
      expect(contains(fragment), `Missing code: ${fragment}`).toBe(true),
    not: {
      toContain: (fragment: string) =>
        expect(contains(fragment), `Unexpected code: ${fragment}`).toBe(false),
    },
  };
}

const readSource = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("floor plan page layout", () => {
  it("keeps the daily service focused on the plan and one compact client list", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const queue = readSource(
      "src/components/floor-plan/SimpleReservationQueue.tsx",
    );

    expectCode(page).toContain("<ServiceBoard");
    expectCode(page).toContain("<SimpleReservationQueue");
    expectCode(page).toContain("Placer automatiquement");
    expectCode(page).toContain('id="floor-plan-reservation-queue"');
    expectCode(page).not.toContain("<DockableFloorPlanPanel");
    expect(queue).toContain("À placer");
    expect(queue).toContain("recommendedTablesByReservationId");
    expect(queue).not.toContain("Timeline");
    expect(queue).not.toContain("Détacher");
    expect(queue).not.toContain("Replier");
  });

  it("keeps the editor canvas-first and exposes dedicated professional workspaces", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expectCode(page).toContain("<StudioCanvas");
    expectCode(page).toContain("<StudioPalette");
    expectCode(page).toContain("<StudioInspector");
    expectCode(page).toContain('value="library"');
    expectCode(page).toContain('value="inspector"');
    expectCode(page).toContain('id="floor-plan-studio-tools"');
    expectCode(page).toContain('aria-label="Sauver variante"');
    expectCode(page).toContain("<FloorPlanSpaces");
    expectCode(page).toContain("Aménagement");
    expectCode(page).toContain("Bibliothèque de mobilier");
    expectCode(page).toContain("Assistant d'aménagement");
  });

  it("retains the responsive full-width canvas and safe touch interactions", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const canvas = readSource("src/components/floor-plan/StudioCanvas.tsx");
    const serviceBoard = readSource(
      "src/components/floor-plan/ServiceBoard.tsx",
    );
    const queue = readSource(
      "src/components/floor-plan/SimpleReservationQueue.tsx",
    );

    expectCode(page).toContain('<DashboardLayout contentWidth="full"');
    expectCode(page).toContain('mainClassName="p-2 pb-16 sm:p-3 md:p-3 md:pb-3"');
    expectCode(page).toContain(
      "xl:h-[calc(100dvh-5rem)] xl:overflow-hidden",
    );
    expectCode(page).toContain(
      "xl:auto-rows-[minmax(0,1fr)] xl:overflow-hidden",
    );
    expectCode(page).toContain("syncCanvasSizeFromViewport");
    expectCode(page).toContain(
      "onCanvasViewportResize={syncCanvasSizeFromViewport}",
    );
    expectCode(page).toContain("revealResponsivePanel");
    expectCode(page).toContain(
      "Clients ({unassignedVisibleReservations.length} à placer)",
    );
    expectCode(canvas).toContain("new ResizeObserver(notifySize)");
    expect(serviceBoard).toContain("new ResizeObserver(notifySize)");
    expect(serviceBoard).toContain("touch-manipulation");
    expect(queue).toContain('role="button"');
    expect(queue).toContain("onReservationHandlePointerDown");
  });

  it("contains the complete floor plan on desktop, tablet and mobile without cropping", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const studio = readSource("src/components/floor-plan/StudioCanvas.tsx");
    const service = readSource("src/components/floor-plan/ServiceBoard.tsx");
    const roomWidth = 1040;
    const roomHeight = 760;
    for (const [name, viewportWidth, viewportHeight] of [
      ["desktop short", 1090, 390],
      ["desktop tall", 1090, 740],
      ["tablet landscape", 850, 540],
      ["tablet portrait", 700, 620],
      ["mobile", 350, 280],
      ["small mobile", 288, 208],
    ] as const) {
      const scale = getFloorPlanContainScale(viewportWidth, viewportHeight, roomWidth, roomHeight);
      expect(scale, name).toBeGreaterThan(0);
      expect(roomWidth * scale, name).toBeLessThanOrEqual(viewportWidth - 10);
      expect(roomHeight * scale, name).toBeLessThanOrEqual(viewportHeight - 10);
      expect(roomWidth * scale / (roomHeight * scale), name).toBeCloseTo(roomWidth / roomHeight);
    }
    expect(getFloorPlanContainScale(1090, 390, roomWidth, roomHeight) * roomHeight).toBeLessThan(390);
    expect(getFloorPlanContainScale(0, 390, roomWidth, roomHeight)).toBe(1);
    expect(getFloorPlanContainScale(390, 0, roomWidth, roomHeight)).toBe(1);
    expect(getFloorPlanContainScale(Number.NaN, 390, roomWidth, roomHeight)).toBe(1);
    expect(getFloorPlanContainScale(900, 700, 0, roomHeight)).toBe(1);
    expectCode(page).toContain("getFloorPlanContainScale(width, height, CANVAS_WIDTH, CANVAS_HEIGHT)");
    expectCode(page).not.toContain("getFloorPlanWidthFitScale");
    expectCode(page).not.toContain("xl:min-h-[780px]");
    for (const canvas of [studio, service]) {
      expectCode(canvas).toContain("m-auto shrink-0 overflow-hidden");
      expectCode(canvas).toContain("flex min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain");
      expectCode(canvas).toContain("useLayoutEffect");
    }
  });

  it("uses a purpose-built illustrated hero without hiding the operational actions", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const styles = readSource("src/components/dashboard/RestaurantWorkspacePages.css");

    expect(page).toContain("tok-floorplan-hero-grid");
    expect(page).toContain("Organisation de salle");
    expect(page).toContain("DASHBOARD_ILLUSTRATIONS.restaurantFloorPlan");
    expect(page).toContain("Préparez les tables, placez les réservations");
    expect(page).toContain("tok-floorplan-actions");
    expect(styles).toContain('grid-template-areas: "copy art"');
    expect(page).toContain("tok-floorplan-toolbar");
    expect(styles).toContain(".tok-floorplan-hero-illustration");
  });

  it("gives the desktop editor a wider canvas and a three-column furniture library without changing the sidebar on other pages", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");
    const palette = readSource("src/components/floor-plan/StudioPalette.tsx");
    const shell = readSource("src/components/DashboardLayout.tsx");
    const styles = readSource("src/components/floor-plan/FloorPlanWorkspace.css");

    expectCode(page).toContain("xl:grid-cols-[minmax(0,1fr)_370px]");
    expectCode(page).toContain("2xl:grid-cols-[minmax(0,1fr)_400px]");
    expectCode(palette).toContain("2xl:grid-cols-3");
    expectCode(palette).toContain('data-floor-plan-library="compact"');
    expectCode(shell).toContain('pathname === "/dashboard/plan-salle" && "tok-floorplan-shell"');
    expect(styles).toContain(".tok-hospitality-workspace.tok-floorplan-shell .tok-workspace-sidebar:not([data-collapsed=\"true\"])");
    expect(styles).toContain(".fp-nav button[aria-selected=\"true\"]");
  });

  it("preserves the floor plan persistence and assignment contracts", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expectCode(page).toContain("restaurant_save_floor_plan_assignments");
    expectCode(page).toContain("getReservationDropStateForAssignments");
    expectCode(page).toContain("reservationsOverlap");
    expectCode(page).toContain("scoreReservationPlacement");
    expectCode(page).toContain("saveMutation.mutate");
    expectCode(page).toContain("lastAutoSavedLayoutSignatureRef");
    expectCode(page).toContain(
      "runFloorPlanSaveWithTimeout(async (saveSignal)",
    );
    expect(page.match(/\.abortSignal\(saveSignal\)/g)).toHaveLength(6);
  });

  it("restores the floor plan visibility for browser printing", () => {
    const styles = readSource(
      "src/components/floor-plan/FloorPlanWorkspace.css",
    );

    expect(styles).toContain("body .fp-workspace *");
    expect(styles).toContain("visibility: visible !important");
    expect(styles).toContain("print-color-adjust: exact");
  });

  it("does not re-arm an auto-save the server already refused", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    // A server refusal is deterministic, and the auto-save effect depends on
    // the mutation while the draft stays dirty. Forgetting the refused
    // signature would replay the same doomed save every 900ms and bury the
    // restaurateur under destructive toasts.
    const errorHandler = page.slice(
      page.indexOf("onError: (error: Error, options) => {"),
    );
    const errorHandlerBody = errorHandler.slice(
      0,
      errorHandler.indexOf("toast({"),
    );

    expectCode(errorHandlerBody).toContain(
      "lastAutoSavedLayoutSignatureRef.current = options.layoutSignature ?? null;",
    );
    expectCode(errorHandlerBody).not.toContain(
      "lastAutoSavedLayoutSignatureRef.current = null;",
    );
    // Switching branch, date or edit mode must still forget it: that is a new
    // context, not a refused one.
    expectCode(page).toContain(
      "}, [editMode, referenceDate, selectedBranchId]);",
    );
  });

  it("never leaves a dirty editing mode without persisting first", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expectCode(page).toContain("const enterTemplateEditing = async");
    expectCode(page).toContain("const finishTemplateEditing = async");
    expectCode(page).toContain("await saveMutation.mutateAsync");
    expectCode(page).toContain("void enterTemplateEditing()");
    expectCode(page).toContain("void finishTemplateEditing()");
    expectCode(page).not.toContain('onClick={() => setEditMode("service")}');
    expectCode(page).not.toContain('onClick={() => setEditMode("template")}');
    expectCode(page).toContain(
      "disabled={saveMutation.isPending || (isTemplateMode ? templateDirty : serviceDirty)}",
    );
    expectCode(page).toContain(
      "disabled={saveMutation.isPending || templateDirty}",
    );
    expectCode(page).toContain(
      "disabled={saveMutation.isPending || serviceDirty}",
    );
  });

  it("tracks every template change and exposes a coherent save state", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalle.tsx");

    expectCode(page).toContain("const templateDirty = useMemo");
    expectCode(page).toContain("persistedTemplateSignature");
    expectCode(page).toContain("draftTemplateSignature");
    expectCode(page).toContain('label: "Modifications non enregistrées"');
    expectCode(page).toContain('label: "Plan enregistré"');
    expectCode(page).toContain(
      'templateDirty ? "Enregistrer le plan puis ouvrir le service"',
    );
  });
});
