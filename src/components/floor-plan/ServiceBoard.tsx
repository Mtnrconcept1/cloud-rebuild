import { useEffect, type DragEvent, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { Grip, LayoutPanelTop, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFloorPlanInteractiveFrame, isReservableFloorPlanItem, type FloorPlanResizeHandle } from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

import {
  FLOOR_PLAN_SHEET_BACKGROUND,
  FLOOR_PLAN_SHEET_FLOOR_CLASS,
  FLOOR_PLAN_SHEET_FLOOR_INLAY_CLASS,
  FLOOR_PLAN_SHEET_GRID_IMAGE,
  FLOOR_PLAN_SHEET_STAGE_CLASS,
  FLOOR_PLAN_SHEET_WALL_CLASS,
  createFloorPlanSheetScale,
} from "./floorPlanSheet";
import { FLOOR_PLAN_TONE_CLASS } from "./floorPlanTones";
import { useFloorPlanZoomViewport, FLOOR_PLAN_MIN_ZOOM, FLOOR_PLAN_MAX_ZOOM } from "./useFloorPlanZoomViewport";
import {
  type RenderedTableFrame,
  type ReservationDropState,
  type ServiceDraftTable,
  type ServiceReservation,
  getCompactReservationCustomerLabel,
  getReservationCustomerLabel,
  getSafeTime,
  getTableDensity,
  getTableServiceState,
  isZeroAttenteReservation,
} from "./serviceShared";

type ServiceBoardProps = {
  selectedSector: string;
  subtitle: string;
  activeReservationLabel: string | null;
  canvasWidth: number;
  canvasHeight: number;
  canvasZoom: number;
  canvasZoomLabel: string;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  visibleTables: ServiceDraftTable[];
  visibleAssignmentsByTable: Map<string, ServiceReservation[]>;
  selectedTableId: string | null;
  selectedReservationId: string | null;
  draggedReservationId: string | null;
  dragOverTableId: string | null;
  visibleTablesCount: number;
  availableTablesCount: number;
  unassignedReservationsCount: number;
  onTablePress: (tableId: string) => void;
  onPrimaryReservationPress: (reservationId: string, tableId: string) => void;
  onReservationStatusChange: (reservationId: string, status: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  onCanvasDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onCanvasDrop: (event: DragEvent<HTMLDivElement>) => void;
  onCanvasDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onCanvasBackgroundPress: () => void;
  onStartDraggingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onStartResizingTable: (event: PointerEvent<HTMLButtonElement>, tableId: string, handle: FloorPlanResizeHandle) => void;
  onStartRotatingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onUpdateCanvasZoom: (nextZoom: number) => void;
  onCanvasViewportResize: (width: number, height: number) => void;
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
  getRenderedFrame: (table: ServiceDraftTable) => RenderedTableFrame;
  getTableContentPadding: (
    layout: ServiceDraftTable["layout"],
    capacity: number,
    zoom: number,
  ) => { top: number; right: number; bottom: number; left: number };
};

const SERVICE_RESIZE_HANDLES: Array<{ key: FloorPlanResizeHandle; className: string; cursor: string }> = [
  { key: "nw", className: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { key: "n", className: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { key: "ne", className: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { key: "e", className: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { key: "se", className: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
  { key: "s", className: "-bottom-1.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { key: "sw", className: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  { key: "w", className: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

// Tons peints *sur* la feuille du plan : ils sont lus sur le fond clair du
// canevas, pas sur celui de la page, donc ils restent clairs dans les deux
// thèmes (cf. floorPlanSheet.ts). Pour le châssis, voir FLOOR_PLAN_TONE_CLASS.
function getSurfaceState({
  isReservable,
  assignmentsCount,
  isZeroAttentePrimary,
  selectedReservationDropState,
}: {
  isReservable: boolean;
  assignmentsCount: number;
  isZeroAttentePrimary: boolean;
  selectedReservationDropState: ReservationDropState | null;
}) {
  if (!isReservable) {
    return {
      haloClass: "bg-slate-300/55 shadow-[0_22px_55px_-42px_rgba(15,23,42,0.55)]",
      chipClass: "border-slate-300 bg-slate-100 text-slate-700",
      label: "Mobilier",
    };
  }

  if (selectedReservationDropState) {
    return selectedReservationDropState.ok
      ? {
          haloClass: "bg-emerald-300/55 shadow-[0_28px_65px_-38px_rgba(16,185,129,0.45)]",
          chipClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
          label: "Compatible",
        }
      : {
          haloClass: "bg-rose-300/55 shadow-[0_28px_65px_-38px_rgba(244,63,94,0.45)]",
          chipClass: "border-rose-300 bg-rose-50 text-rose-700",
          label: "Conflit",
        };
  }

  if (assignmentsCount > 0) {
    return isZeroAttentePrimary
      ? {
          haloClass: "bg-teal-300/55 shadow-[0_28px_65px_-38px_rgba(20,184,166,0.45)]",
          chipClass: "border-teal-300 bg-teal-50 text-teal-700",
          label: "Zéro Attente",
        }
      : {
          haloClass: "bg-sky-300/55 shadow-[0_28px_65px_-38px_rgba(14,165,233,0.45)]",
          chipClass: "border-sky-300 bg-sky-50 text-sky-700",
          label: "Placée",
        };
  }

  return {
    haloClass: "bg-emerald-200/45 shadow-[0_28px_65px_-40px_rgba(16,185,129,0.35)]",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Libre",
  };
}

function getDropAwareSurfaceState({
  baseState,
  selectedReservationDropState,
}: {
  baseState: ReturnType<typeof getTableServiceState>;
  selectedReservationDropState: ReservationDropState | null;
}) {
  if (!selectedReservationDropState) return baseState;

  return selectedReservationDropState.ok
    ? {
        haloClass: "bg-emerald-300/55 shadow-[0_28px_65px_-38px_rgba(16,185,129,0.45)]",
        chipClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
        label: "Compatible",
        detail: null,
        key: "free" as const,
      }
    : {
        haloClass: "bg-rose-300/55 shadow-[0_28px_65px_-38px_rgba(244,63,94,0.45)]",
        chipClass: "border-rose-300 bg-rose-50 text-rose-700",
        label: "Conflit",
        detail: null,
        key: "late" as const,
      };
}

export default function ServiceBoard({
  selectedSector,
  subtitle,
  activeReservationLabel,
  canvasWidth,
  canvasHeight,
  canvasZoom,
  canvasZoomLabel,
  canvasRef,
  canvasViewportRef,
  visibleTables,
  visibleAssignmentsByTable,
  selectedTableId,
  selectedReservationId,
  draggedReservationId,
  dragOverTableId,
  visibleTablesCount,
  availableTablesCount,
  unassignedReservationsCount,
  onTablePress,
  onPrimaryReservationPress,
  onReservationStatusChange,
  onReleaseReservation,
  onCanvasDragOver,
  onCanvasDrop,
  onCanvasDragLeave,
  onCanvasBackgroundPress,
  onStartDraggingTable,
  onStartResizingTable,
  onStartRotatingTable,
  onUpdateCanvasZoom,
  onCanvasViewportResize,
  getReservationDropState,
  getRenderedFrame,
  getTableContentPadding,
}: ServiceBoardProps) {
  const canvasRatio = `${canvasWidth} / ${canvasHeight}`;
  const getScaledCanvasToken = createFloorPlanSheetScale(canvasWidth, canvasHeight);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return undefined;

    let lastWidth = 0;
    let lastHeight = 0;

    const notifySize = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (width <= 0 || height <= 0) return;
      if (width === lastWidth && height === lastHeight) return;

      lastWidth = width;
      lastHeight = height;
      onCanvasViewportResize(width, height);
    };

    notifySize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(notifySize) : null;
    observer?.observe(viewport);
    window.addEventListener("resize", notifySize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", notifySize);
    };
  }, [canvasViewportRef, onCanvasViewportResize]);

  const { zoomIn, zoomOut, resetZoom } = useFloorPlanZoomViewport({
    viewportRef: canvasViewportRef,
    zoom: canvasZoom,
    onZoomChange: onUpdateCanvasZoom,
  });

  const startFurnitureSurfaceDrag = (
    event: PointerEvent<HTMLDivElement>,
    table: ServiceDraftTable,
  ) => {
    if (isReservableFloorPlanItem(table.layout.kind)) return;
    if ((event.target as HTMLElement).closest("button")) return;
    onStartDraggingTable(event, table.id);
  };

  const handleTableKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    table: ServiceDraftTable,
  ) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onTablePress(table.id);
  };

  return (
    <Card className="flex h-[min(68svh,680px)] min-h-[430px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:h-full xl:min-h-0">
      <CardHeader className="space-y-3 border-b border-border/70 px-4 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-lg text-foreground">{selectedSector}</CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">{subtitle}</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("rounded-full", FLOOR_PLAN_TONE_CLASS.neutral)}>
              Tables {visibleTablesCount}
            </Badge>
            <Badge variant="outline" className={cn("rounded-full", FLOOR_PLAN_TONE_CLASS.emerald)}>
              Libres {availableTablesCount}
            </Badge>
            <Badge variant="outline" className={cn("rounded-full", FLOOR_PLAN_TONE_CLASS.amber)}>
              Sans table {unassignedReservationsCount}
            </Badge>
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-card px-1 py-1 shadow-sm">
              <span className="min-w-14 text-center text-sm font-semibold">{canvasZoomLabel}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-xl sm:h-9 sm:w-9"
                onClick={zoomOut}
                disabled={canvasZoom <= FLOOR_PLAN_MIN_ZOOM}
                aria-label="Réduire le zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-xl sm:h-9 sm:w-9"
                onClick={zoomIn}
                disabled={canvasZoom >= FLOOR_PLAN_MAX_ZOOM}
                aria-label="Augmenter le zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {activeReservationLabel ? (
          <div className={cn("flex items-start gap-3 rounded-2xl px-3 py-2", FLOOR_PLAN_TONE_CLASS.amber)}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-amber-700 shadow-sm dark:bg-amber-500/15 dark:text-amber-200">
              <Grip className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Placement en cours</p>
              <p className="mt-1 truncate text-sm font-semibold text-amber-950 dark:text-amber-50">{activeReservationLabel}</p>
              <p className="text-xs text-amber-800 dark:text-amber-200/80">Glissez vers une table compatible.</p>
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted p-2">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/70 bg-background/60 p-2 shadow-inner">
            <div ref={canvasViewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain" role="region" aria-label={`Plan de service du secteur ${selectedSector}`}>
              <div style={{ width: canvasWidth * canvasZoom, height: canvasHeight * canvasZoom }}>
                <div
                  ref={canvasRef}
                  data-floor-plan-canvas="stage"
                  className={FLOOR_PLAN_SHEET_STAGE_CLASS}
                  onDragOver={onCanvasDragOver}
                  onDrop={onCanvasDrop}
                  onDragLeave={onCanvasDragLeave}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      onCanvasBackgroundPress();
                    }
                  }}
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    aspectRatio: canvasRatio,
                    transform: `scale(${canvasZoom})`,
                    borderRadius: getScaledCanvasToken(28, 8),
                    backgroundImage: FLOOR_PLAN_SHEET_GRID_IMAGE,
                    backgroundSize: `${getScaledCanvasToken(36, 8)} ${getScaledCanvasToken(36, 8)}, ${getScaledCanvasToken(36, 8)} ${getScaledCanvasToken(36, 8)}`,
                    backgroundColor: FLOOR_PLAN_SHEET_BACKGROUND,
                  }}
                >
                  <div
                    className={FLOOR_PLAN_SHEET_WALL_CLASS}
                    style={{
                      inset: getScaledCanvasToken(24, 3),
                      borderRadius: getScaledCanvasToken(36, 8),
                      borderWidth: getScaledCanvasToken(16, 3),
                    }}
                  />
                  <div
                    className={FLOOR_PLAN_SHEET_FLOOR_CLASS}
                    style={{
                      inset: getScaledCanvasToken(46, 6),
                      borderRadius: getScaledCanvasToken(26, 6),
                    }}
                  />
                  <div
                    className={FLOOR_PLAN_SHEET_FLOOR_INLAY_CLASS}
                    style={{
                      inset: getScaledCanvasToken(64, 8),
                      borderRadius: getScaledCanvasToken(16, 4),
                    }}
                  />

                  {visibleTables.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-slate-500">
                      <LayoutPanelTop className="h-10 w-10 text-primary/60" />
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">Aucun élément dans ce secteur</p>
                        <p className="max-w-[280px] text-sm">Passez en « Structure » pour ajouter des tables, puis revenez au plan du jour.</p>
                      </div>
                    </div>
                  ) : null}

                  {visibleTables.map((table) => {
                    const assignments = visibleAssignmentsByTable.get(table.id) || [];
                    const primaryAssignment = assignments[0] || null;
                    const renderedFrame = getRenderedFrame(table);
                    const interactiveFrame = getFloorPlanInteractiveFrame(renderedFrame);
                    const density = getTableDensity(renderedFrame);
                    const isReservable = table.capacity > 0;
                    const contentPadding = isReservable
                      ? getTableContentPadding(table.layout, table.capacity, canvasZoom)
                      : { top: 0, right: 0, bottom: 0, left: 0 };
                    const selectedReservationDropState = selectedReservationId && isReservable
                      ? getReservationDropState(selectedReservationId, table.id)
                      : null;
                    const serviceState = getTableServiceState({
                      isReservable,
                      assignments,
                    });
                    const surfaceState = getDropAwareSurfaceState({
                      baseState: serviceState,
                      selectedReservationDropState,
                    });
                    const isSelected = table.id === selectedTableId;
                    const isDragTarget = dragOverTableId === table.id && !!draggedReservationId;
                    const showQuickActions = isSelected && isReservable && primaryAssignment && density === "regular";
                    const primaryStatus = String(primaryAssignment?.status || "pending").toLowerCase();
                    const canConfirm = primaryStatus === "pending";
                    const canMarkArrived = primaryStatus === "confirmed";
                    const canSeat = primaryStatus === "confirmed" || primaryStatus === "arrived";
                    const canMarkNoShow = primaryStatus === "confirmed";
                    const canDropHere = draggedReservationId && isReservable
                      ? getReservationDropState(draggedReservationId, table.id).ok
                      : false;

                    return (
                      <div
                        key={table.id}
                        className={cn(
                          "absolute select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
                          isReservable ? "touch-manipulation" : "touch-none",
                        )}
                        style={{
                          left: interactiveFrame.x,
                          top: interactiveFrame.y,
                          width: interactiveFrame.w,
                          height: interactiveFrame.h,
                          zIndex: isSelected ? 40 : assignments.length > 0 ? 24 : 12,
                          cursor: !isReservable ? "grab" : undefined,
                        }}
                        onClick={() => onTablePress(table.id)}
                        onPointerDown={(event) => startFurnitureSurfaceDrag(event, table)}
                        onKeyDown={(event) => handleTableKeyDown(event, table)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${table.table_number}, ${surfaceState.label}`}
                        aria-pressed={isSelected}
                      >
                        <div className={cn(
                          "pointer-events-none absolute inset-0 rounded-[28px] blur-[16px]",
                          surfaceState.haloClass,
                          isSelected && "scale-110 opacity-95",
                          !isSelected && "opacity-80",
                        )} />

                        <div
                          className="absolute"
                          style={{
                            left: interactiveFrame.visualOffsetX,
                            top: interactiveFrame.visualOffsetY,
                            width: renderedFrame.w,
                            height: renderedFrame.h,
                            transform: `rotate(${table.layout.rotation}deg)`,
                            transformOrigin: "center center",
                          }}
                        >
                          <div className="absolute inset-0">
                            <FloorPlanItemIllustration
                              kind={table.layout.kind}
                              shape={table.layout.shape}
                              capacity={table.capacity}
                              seatType={table.layout.seatType}
                              seatPlacements={table.layout.seatPlacements}
                              cornerBenchCorners={table.layout.cornerBenchCorners}
                              cornerBenchConfigs={table.layout.cornerBenchConfigs}
                              tableWidth={table.layout.tableWidth}
                              tableHeight={table.layout.tableHeight}
                              cornerBenchHorizontal={table.layout.cornerBenchHorizontal}
                              cornerBenchVertical={table.layout.cornerBenchVertical}
                              cornerBenchDepth={table.layout.cornerBenchDepth}
                              className="h-full w-full"
                              preserveAspectRatio="none"
                            />
                          </div>

                          {isSelected ? (
                            <div className="pointer-events-none absolute inset-[-3px] rounded-[24px] border-2 border-orange-500/80 shadow-[0_0_0_4px_rgba(255,255,255,0.68)]" />
                          ) : null}

                          {isDragTarget ? (
                            <div className={cn(
                              "pointer-events-none absolute inset-[-3px] rounded-[24px] border-2",
                              canDropHere ? "border-emerald-500 bg-emerald-50/30" : "border-rose-500 bg-rose-50/30",
                            )} />
                          ) : null}

                          {isReservable ? (
                            <div
                              className="absolute inset-0 flex flex-col overflow-hidden"
                              style={{
                                paddingTop: contentPadding.top,
                                paddingRight: contentPadding.right,
                                paddingBottom: contentPadding.bottom,
                                paddingLeft: contentPadding.left,
                              }}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className={cn(
                                    "break-words font-bold text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.75)]",
                                    density === "regular" ? "text-sm" : density === "compact" ? "text-[10px]" : "text-[8px]",
                                  )}>
                                    {table.table_number}
                                  </p>
                                  {density !== "tight" ? (
                                    <p className={cn(
                                      "uppercase text-slate-500 drop-shadow-[0_1px_1px_rgba(255,255,255,0.75)]",
                                      density === "regular" ? "text-[9px] tracking-[0.14em]" : "text-[7px] tracking-[0.1em]",
                                    )}>
                                      {table.capacity} couv.
                                    </p>
                                  ) : null}
                                </div>

                                <Badge className={cn(
                                  "pointer-events-none rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em]",
                                  surfaceState.chipClass,
                                )}>
                                  {surfaceState.label}
                                </Badge>
                              </div>

                              {serviceState.detail && density === "regular" ? (
                                <div className="mt-1 inline-flex w-fit rounded-full border border-white/75 bg-white/82 px-2 py-0.5 text-[9px] font-semibold text-slate-600 shadow-sm">
                                  {serviceState.detail}
                                </div>
                              ) : null}

                              <div className={cn(
                                "flex min-h-0 flex-1 flex-col items-center justify-center",
                                density === "regular" ? "gap-1.5" : "gap-0.5",
                              )}>
                                {primaryAssignment ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onPrimaryReservationPress(primaryAssignment.id, table.id);
                                    }}
                                    className={cn(
                                      "max-w-full border text-left shadow-sm backdrop-blur-sm transition-colors",
                                      isZeroAttenteReservation(primaryAssignment)
                                        ? "border-teal-200 bg-teal-50/90 hover:bg-teal-100/90"
                                        : "border-white/70 bg-white/92 hover:bg-white",
                                      density === "regular"
                                        ? "rounded-xl px-2.5 py-1.5"
                                        : density === "compact"
                                          ? "rounded-lg px-1.5 py-1"
                                          : "rounded-md px-1 py-0.5",
                                    )}
                                  >
                                    <p className={cn(
                                      "truncate font-semibold text-slate-950",
                                      density === "regular" ? "text-[11px]" : density === "compact" ? "text-[9px]" : "text-[7px]",
                                    )}>
                                      {getCompactReservationCustomerLabel(primaryAssignment, density)}
                                    </p>
                                    <div className="flex items-center gap-1">
                                      <span className={cn(
                                        "font-medium text-slate-500",
                                        density === "regular" ? "text-[10px]" : "text-[7px]",
                                      )}>
                                        {getSafeTime(primaryAssignment.time)} {density === "tight" ? `${primaryAssignment.party_size}p` : `${primaryAssignment.party_size} pers.`}
                                      </span>
                                    </div>
                                  </button>
                                ) : (
                                  <div className={cn(
                                    "rounded-full border border-dashed px-2 py-1 text-center font-medium text-slate-500",
                                    density === "regular" ? "text-[10px]" : "text-[8px]",
                                  )}>
                                    Libre
                                  </div>
                                )}

                                {showQuickActions ? (
                                  <div className="flex max-w-full flex-wrap justify-center gap-1">
                                    {canConfirm ? (
                                      <button
                                        type="button"
                                        aria-label={`Confirmer ${getReservationCustomerLabel(primaryAssignment)}`}
                                        className="rounded-full border border-sky-200 bg-white/92 px-2 py-1 text-[9px] font-semibold text-sky-700 shadow-sm transition-colors hover:bg-sky-50"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onReservationStatusChange(primaryAssignment.id, "confirmed");
                                        }}
                                      >
                                        Confirmer
                                      </button>
                                    ) : null}
                                    {canMarkArrived ? (
                                      <button
                                        type="button"
                                        aria-label={`Marquer ${getReservationCustomerLabel(primaryAssignment)} arrive`}
                                        className="rounded-full border border-sky-200 bg-white/92 px-2 py-1 text-[9px] font-semibold text-sky-700 shadow-sm transition-colors hover:bg-sky-50"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onReservationStatusChange(primaryAssignment.id, "arrived");
                                        }}
                                      >
                                        Arrivé
                                      </button>
                                    ) : null}
                                    {canSeat ? (
                                      <button
                                        type="button"
                                        aria-label={`Installer ${getReservationCustomerLabel(primaryAssignment)}`}
                                        className="rounded-full border border-emerald-200 bg-white/92 px-2 py-1 text-[9px] font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onReservationStatusChange(primaryAssignment.id, "seated");
                                        }}
                                      >
                                        Installé
                                      </button>
                                    ) : null}
                                    {canMarkNoShow ? (
                                      <button
                                        type="button"
                                        aria-label={`Marquer ${getReservationCustomerLabel(primaryAssignment)} no-show`}
                                        className="rounded-full border border-rose-200 bg-white/92 px-2 py-1 text-[9px] font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onReservationStatusChange(primaryAssignment.id, "no_show");
                                        }}
                                      >
                                        No-show
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      aria-label={`Liberer ${table.table_number}`}
                                      className="rounded-full border border-slate-200 bg-white/92 px-2 py-1 text-[9px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onReleaseReservation(primaryAssignment.id);
                                      }}
                                    >
                                      Libérer
                                    </button>
                                  </div>
                                ) : null}

                                {assignments.length > 1 && density !== "tight" ? (
                                  <span className={cn(
                                    "font-medium text-slate-500 drop-shadow-[0_1px_1px_rgba(255,255,255,0.75)]",
                                    density === "regular" ? "text-[10px]" : "text-[8px]",
                                  )}>
                                    +{assignments.length - 1} réservation(s)
                                  </span>
                                ) : null}
                              </div>

                              {isDragTarget && draggedReservationId ? (
                                <div className={cn(
                                  "absolute bottom-1 left-1 right-1 rounded-lg border px-2 py-1 text-center text-[9px] font-semibold backdrop-blur-sm",
                                  canDropHere
                                    ? "border-emerald-200 bg-emerald-100/90 text-emerald-800"
                                    : "border-rose-200 bg-rose-100/90 text-rose-800",
                                )}>
                                  {canDropHere ? "Affecter ici" : getReservationDropState(draggedReservationId, table.id).reason}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {isSelected ? (
                            <button
                              type="button"
                              aria-label={`Déplacer ${table.table_number}`}
                              className="absolute left-1 top-1 flex h-11 w-11 touch-none items-center justify-center rounded-full border border-slate-900/15 bg-white shadow-md sm:h-9 sm:w-9 xl:h-7 xl:w-7"
                              onPointerDown={(event) => onStartDraggingTable(event, table.id)}
                            >
                              <Grip className="h-3.5 w-3.5 text-slate-700" />
                            </button>
                          ) : null}

                          {isSelected
                            ? SERVICE_RESIZE_HANDLES.map((handle) => (
                              <button
                                key={handle.key}
                                type="button"
                                aria-label={`Redimensionner ${table.table_number}`}
                                className={cn(
                                "absolute h-10 w-10 touch-none rounded-full border border-slate-900/15 bg-white shadow-sm transition-transform hover:scale-110 sm:h-8 sm:w-8 xl:h-7 xl:w-7",
                                handle.className,
                              )}
                              style={{ cursor: handle.cursor }}
                              onPointerDown={(event) => onStartResizingTable(event, table.id, handle.key)}
                            >
                              <span className="absolute inset-[8px] rounded-full bg-slate-800" />
                            </button>
                          ))
                          : null}
                        </div>

                        {isSelected ? (
                          <div
                            className="absolute flex items-center justify-center"
                            style={{
                              top: -28,
                              left: "50%",
                              transform: "translateX(-50%)",
                              cursor: "grab",
                            }}
                            onPointerDown={(event) => onStartRotatingTable(event, table.id)}
                          >
                            <div className="flex h-11 w-11 touch-none items-center justify-center rounded-full border border-slate-900/15 bg-white shadow-md sm:h-9 sm:w-9 xl:h-7 xl:w-7">
                              <RotateCw className="h-3.5 w-3.5 text-slate-700" />
                            </div>
                            <div className="absolute top-6 h-2 w-px bg-slate-900/25" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
