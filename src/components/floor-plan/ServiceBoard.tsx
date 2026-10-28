import {
  useEffect,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  CalendarClock,
  Check,
  CircleCheck,
  Clock3,
  Grip,
  LayoutPanelTop,
  LockKeyhole,
  Maximize2,
  PencilRuler,
  RotateCw,
  TriangleAlert,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getFloorPlanInteractiveFrame,
  isReservableFloorPlanItem,
  type FloorPlanResizeHandle,
} from "@/lib/floorPlan";
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
import {
  useFloorPlanZoomViewport,
  FLOOR_PLAN_MIN_ZOOM,
  FLOOR_PLAN_MAX_ZOOM,
} from "./useFloorPlanZoomViewport";
import {
  type RenderedTableFrame,
  type ReservationDropState,
  type ServiceDraftTable,
  type ServiceReservation,
  type TableServiceStateKey,
  getCompactReservationCustomerLabel,
  getReservationCustomerLabel,
  getSafeTime,
  getTableDensity,
  getTableServiceState,
  isReservationInService,
} from "./serviceShared";

type ServiceBoardProps = {
  selectedSector: string;
  subtitle: string;
  activeReservationLabel: string | null;
  canvasWidth: number;
  canvasHeight: number;
  canvasZoom: number;
  canvasScale?: number;
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
  onStartDraggingTable: (
    event: PointerEvent<HTMLElement>,
    tableId: string,
  ) => void;
  onStartResizingTable: (
    event: PointerEvent<HTMLButtonElement>,
    tableId: string,
    handle: FloorPlanResizeHandle,
  ) => void;
  onStartRotatingTable: (
    event: PointerEvent<HTMLElement>,
    tableId: string,
  ) => void;
  onUpdateCanvasZoom: (nextZoom: number) => void;
  onCanvasViewportResize: (width: number, height: number) => void;
  getReservationDropState: (
    reservationId: string,
    tableId: string,
  ) => ReservationDropState;
  getRenderedFrame: (table: ServiceDraftTable) => RenderedTableFrame;
  getTableContentPadding: (
    layout: ServiceDraftTable["layout"],
    capacity: number,
    zoom: number,
  ) => { top: number; right: number; bottom: number; left: number };
};

const SERVICE_RESIZE_HANDLES: Array<{
  key: FloorPlanResizeHandle;
  className: string;
  cursor: string;
}> = [
  { key: "nw", className: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  {
    key: "n",
    className: "left-1/2 -top-1.5 -translate-x-1/2",
    cursor: "ns-resize",
  },
  { key: "ne", className: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  {
    key: "e",
    className: "-right-1.5 top-1/2 -translate-y-1/2",
    cursor: "ew-resize",
  },
  { key: "se", className: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
  {
    key: "s",
    className: "-bottom-1.5 left-1/2 -translate-x-1/2",
    cursor: "ns-resize",
  },
  { key: "sw", className: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  {
    key: "w",
    className: "-left-1.5 top-1/2 -translate-y-1/2",
    cursor: "ew-resize",
  },
];

const SERVICE_MARKERS = {
  free: { dot: "bg-[#638d45]", border: "border-[#6b944e]", icon: CircleCheck },
  upcoming: {
    dot: "bg-amber-500",
    border: "border-amber-500",
    icon: CalendarClock,
  },
  occupied: { dot: "bg-primary", border: "border-orange-500", icon: Users },
  arrived: { dot: "bg-sky-600", border: "border-sky-500", icon: Users },
  "soon-free": { dot: "bg-lime-600", border: "border-lime-500", icon: Clock3 },
  "zero-attente": {
    dot: "bg-teal-600",
    border: "border-teal-500",
    icon: Check,
  },
  late: { dot: "bg-rose-600", border: "border-rose-500", icon: Clock3 },
  conflict: {
    dot: "bg-rose-600",
    border: "border-rose-500",
    icon: TriangleAlert,
  },
  "no-show": {
    dot: "bg-stone-500",
    border: "border-stone-400",
    icon: TriangleAlert,
  },
  furniture: {
    dot: "bg-stone-400",
    border: "border-transparent",
    icon: LayoutPanelTop,
  },
} satisfies Record<
  TableServiceStateKey,
  { dot: string; border: string; icon: typeof CircleCheck }
>;

function getDropAwareSurfaceState(
  baseState: ReturnType<typeof getTableServiceState>,
  dropState: ReservationDropState | null,
) {
  if (!dropState)
    return {
      ...baseState,
      label:
        (
          {
            arrived: "Arrivée",
            occupied: "Occupée",
            upcoming: "Réservée",
            "soon-free": "Bientôt libre",
          } as Partial<Record<TableServiceStateKey, string>>
        )[baseState.key] || baseState.label,
    };
  return {
    ...baseState,
    key: dropState.ok ? ("free" as const) : ("conflict" as const),
    label: dropState.ok ? "Compatible" : "Incompatible",
  };
}

export default function ServiceBoard({
  selectedSector,
  subtitle,
  activeReservationLabel,
  canvasWidth,
  canvasHeight,
  canvasZoom,
  canvasScale = 1,
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
  const [adjustingPlan, setAdjustingPlan] = useState(false);
  const canvasRatio = `${canvasWidth} / ${canvasHeight}`;
  const getScaledCanvasToken = createFloorPlanSheetScale(
    canvasWidth,
    canvasHeight,
  );

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
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(notifySize)
        : null;
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
    if (
      !adjustingPlan ||
      table.layout.locked ||
      isReservableFloorPlanItem(table.layout.kind)
    )
      return;
    if ((event.target as HTMLElement).closest("button")) return;
    onStartDraggingTable(event, table.id);
  };

  const handleTableKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    table: ServiceDraftTable,
  ) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select"))
      return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onTablePress(table.id);
  };

  const selectedTable =
    visibleTables.find((table) => table.id === selectedTableId) || null;
  const selectedAssignments = selectedTable
    ? visibleAssignmentsByTable.get(selectedTable.id) || []
    : [];
  const selectedPrimary = selectedAssignments[0] || null;
  const selectedStatus = String(
    selectedPrimary?.status || "pending",
  ).toLowerCase();
  const reservationsInRoom = new Map(
    Array.from(visibleAssignmentsByTable.values())
      .flat()
      .filter(isReservationInService)
      .map((reservation) => [reservation.id, reservation]),
  );
  const coversInRoom = Array.from(reservationsInRoom.values()).reduce(
    (total, reservation) => total + reservation.party_size,
    0,
  );
  const reservableTablesCount = visibleTables.filter(
    (table) => table.capacity > 0,
  ).length;

  return (
    <Card className="flex h-[min(75svh,800px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_3px_20px_-14px_rgba(64,42,22,0.2)] dark:border-border dark:bg-card xl:h-full xl:min-h-0">
      <CardHeader className="shrink-0 space-y-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="font-serif text-xl font-semibold tracking-tight text-stone-900 dark:text-foreground">
              {selectedSector}
            </CardTitle>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-muted-foreground">
              {subtitle}
            </p>
          </div>
          <div
            className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5 dark:border-border dark:bg-card"
            aria-label="Zoom du plan"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-md"
              onClick={zoomOut}
              disabled={canvasZoom <= FLOOR_PLAN_MIN_ZOOM}
              aria-label="Réduire le zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-12 text-center text-xs font-medium tabular-nums">
              {canvasZoomLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-md"
              onClick={zoomIn}
              disabled={canvasZoom >= FLOOR_PLAN_MAX_ZOOM}
              aria-label="Augmenter le zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-border" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-md"
              onClick={resetZoom}
              aria-label="Ajuster le plan à la largeur (100 %)"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-y-3 rounded-xl border border-stone-200/80 bg-stone-50/40 px-3 py-3 dark:border-border dark:bg-muted/20 sm:grid-cols-4">
          {[
            {
              value: reservableTablesCount,
              label: "Tables",
              icon: LayoutPanelTop,
            },
            { value: coversInRoom, label: "Couverts en salle", icon: Users },
            {
              value: unassignedReservationsCount,
              label: "À placer",
              icon: CalendarClock,
            },
            {
              value: availableTablesCount,
              label: "Tables libres",
              icon: CircleCheck,
            },
          ].map(({ value, label, icon: Icon }, index) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-2.5 px-2",
                index > 0 &&
                  "sm:border-l sm:border-stone-200 sm:dark:border-border",
              )}
            >
              <Icon className="h-5 w-5 shrink-0 stroke-[1.4] text-stone-600 dark:text-muted-foreground" />
              <div>
                <p className="text-lg font-semibold leading-none tabular-nums text-stone-900 dark:text-foreground">
                  {value}
                </p>
                <p className="mt-1 text-[11px] text-stone-500 dark:text-muted-foreground">
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ul
            className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-stone-600 dark:text-muted-foreground"
            aria-label="Légende du plan"
          >
            {[
              { label: "Libre", dot: SERVICE_MARKERS.free.dot },
              { label: "Occupée", dot: SERVICE_MARKERS.occupied.dot },
              { label: "Réservée", dot: SERVICE_MARKERS.upcoming.dot },
              { label: "Arrivée", dot: SERVICE_MARKERS.arrived.dot },
              { label: "À vérifier", dot: SERVICE_MARKERS.conflict.dot },
            ].map((state) => (
              <li
                key={state.label}
                className="inline-flex items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  className={cn("h-2.5 w-2.5 rounded-full", state.dot)}
                />
                {state.label}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={adjustingPlan}
            className={cn(
              "h-9 rounded-lg px-2 text-[11px] text-stone-500",
              adjustingPlan &&
                "bg-orange-50 text-orange-700 dark:bg-primary/10 dark:text-orange-200",
            )}
            onClick={() => setAdjustingPlan((value) => !value)}
          >
            <PencilRuler className="mr-1.5 h-3.5 w-3.5" />
            {adjustingPlan
              ? "Terminer les ajustements"
              : "Ajuster le plan du jour"}
          </Button>
        </div>
        {activeReservationLabel && draggedReservationId ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
              FLOOR_PLAN_TONE_CLASS.amber,
            )}
          >
            <Grip className="h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">{activeReservationLabel}</span> ·
              Déposez sur une table compatible.
            </p>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-200/80 bg-[#f8f6f2] p-1.5 dark:border-border">
          <div
            ref={canvasViewportRef}
            className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-lg"
            role="region"
            aria-label={`Plan de service du secteur ${selectedSector}`}
          >
            <div
              className="mx-auto overflow-hidden"
              style={{
                width: canvasWidth * canvasZoom * canvasScale,
                height: canvasHeight * canvasZoom * canvasScale,
              }}
            >
              <div
                ref={canvasRef}
                data-floor-plan-canvas="stage"
                className={FLOOR_PLAN_SHEET_STAGE_CLASS}
                onDragOver={onCanvasDragOver}
                onDrop={onCanvasDrop}
                onDragLeave={onCanvasDragLeave}
                onClick={(event) => {
                  if (event.target === event.currentTarget)
                    onCanvasBackgroundPress();
                }}
                style={{
                  width: `${canvasWidth}px`,
                  height: `${canvasHeight}px`,
                  aspectRatio: canvasRatio,
                  transform: `scale(${canvasZoom * canvasScale})`,
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
                    borderRadius: getScaledCanvasToken(12, 3),
                    borderWidth: getScaledCanvasToken(10, 3),
                  }}
                />
                <div
                  className={FLOOR_PLAN_SHEET_FLOOR_CLASS}
                  style={{
                    inset: getScaledCanvasToken(46, 6),
                    borderRadius: getScaledCanvasToken(3, 1),
                  }}
                />
                <div
                  className={FLOOR_PLAN_SHEET_FLOOR_INLAY_CLASS}
                  style={{
                    inset: getScaledCanvasToken(50, 7),
                    borderRadius: getScaledCanvasToken(3, 1),
                  }}
                />
                {visibleTables.length === 0 ? (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center text-stone-600">
                    <div className="rounded-2xl bg-white/70 p-4">
                      <LayoutPanelTop className="h-8 w-8 text-stone-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-serif text-xl font-semibold text-stone-800">
                        Votre salle prend forme ici
                      </p>
                      <p className="max-w-[280px] text-sm">
                        Ajoutez des tables dans Aménagement pour préparer votre
                        prochain service.
                      </p>
                    </div>
                  </div>
                ) : null}
                {visibleTables.map((table) => {
                  const assignments =
                    visibleAssignmentsByTable.get(table.id) || [];
                  const primaryAssignment = assignments[0] || null;
                  const renderedFrame = getRenderedFrame(table);
                  const interactiveFrame =
                    getFloorPlanInteractiveFrame(renderedFrame);
                  const density = getTableDensity(renderedFrame);
                  const isReservable = table.capacity > 0;
                  const contentPadding = isReservable
                    ? getTableContentPadding(table.layout, table.capacity, 1)
                    : { top: 0, right: 0, bottom: 0, left: 0 };
                  const selectedReservationDropState =
                    selectedReservationId && isReservable
                      ? getReservationDropState(selectedReservationId, table.id)
                      : null;
                  const serviceState = getTableServiceState({
                    isReservable,
                    assignments,
                  });
                  const surfaceState = getDropAwareSurfaceState(
                    serviceState,
                    selectedReservationDropState,
                  );
                  const marker = SERVICE_MARKERS[surfaceState.key];
                  const StatusIcon = marker.icon;
                  const isSelected = table.id === selectedTableId;
                  const canAdjust = adjustingPlan && !table.layout.locked;
                  const isDragTarget =
                    dragOverTableId === table.id && !!draggedReservationId;
                  const canDropHere =
                    draggedReservationId && isReservable
                      ? getReservationDropState(draggedReservationId, table.id)
                          .ok
                      : false;
                  return (
                    <div
                      key={table.id}
                      className={cn(
                        "absolute select-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
                        canAdjust && !isReservable
                          ? "touch-none"
                          : "touch-manipulation",
                      )}
                      style={{
                        left: interactiveFrame.x,
                        top: interactiveFrame.y,
                        width: interactiveFrame.w,
                        height: interactiveFrame.h,
                        zIndex: table.layout.visualVariant === "table-plant"
                          ? 44
                          : isSelected
                            ? 40
                            : table.layout.visualVariant === "parasol"
                              ? 8
                              : assignments.length > 0
                                ? 24
                                : 12,
                        cursor: canAdjust && !isReservable ? "grab" : "pointer",
                      }}
                      onClick={() => onTablePress(table.id)}
                      onPointerDown={(event) =>
                        startFurnitureSurfaceDrag(event, table)
                      }
                      onKeyDown={(event) => handleTableKeyDown(event, table)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${table.table_number}, ${surfaceState.label}${table.layout.locked ? ", position verrouillée" : ""}`}
                      aria-pressed={isSelected}
                    >
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
                        <div className="pointer-events-none absolute inset-0">
                          <FloorPlanItemIllustration
                            kind={table.layout.kind}
                            shape={table.layout.shape}
                            capacity={table.capacity}
                            visualVariant={table.layout.visualVariant}
                            finish={table.layout.finish}
                            seatType={table.layout.seatType}
                            seatPlacements={table.layout.seatPlacements}
                            cornerBenchCorners={table.layout.cornerBenchCorners}
                            cornerBenchConfigs={table.layout.cornerBenchConfigs}
                            tableWidth={table.layout.tableWidth}
                            tableHeight={table.layout.tableHeight}
                            cornerBenchHorizontal={
                              table.layout.cornerBenchHorizontal
                            }
                            cornerBenchVertical={
                              table.layout.cornerBenchVertical
                            }
                            cornerBenchDepth={table.layout.cornerBenchDepth}
                            className="h-full w-full"
                            preserveAspectRatio="none"
                          />
                        </div>
                        {isSelected && (!isReservable || canAdjust) ? (
                          <div className="pointer-events-none absolute inset-[-3px] rounded-xl border-2 border-primary/80 shadow-[0_0_0_3px_rgba(255,255,255,0.85)]" />
                        ) : null}
                        {isReservable ? (
                          <div
                            className="absolute"
                            style={{
                              top: contentPadding.top,
                              right: contentPadding.right,
                              bottom: contentPadding.bottom,
                              left: contentPadding.left,
                            }}
                          >
                            <div
                              className={cn(
                                "pointer-events-none absolute inset-0 border-2",
                                marker.border,
                                isSelected &&
                                  "ring-2 ring-white ring-offset-2 ring-offset-orange-500",
                                isDragTarget &&
                                  (canDropHere
                                    ? "bg-emerald-100/35"
                                    : "bg-rose-100/35"),
                              )}
                              style={{
                                borderRadius:
                                  table.layout.shape === "round" ? "50%" : 8,
                              }}
                            />
                            <div
                              className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                              style={{
                                transform: `rotate(${-table.layout.rotation}deg)`,
                              }}
                            >
                              <span
                                className={cn(
                                  "max-w-full truncate rounded-full bg-white/95 px-2 py-0.5 font-semibold leading-tight text-stone-900 shadow-sm",
                                  density === "regular"
                                    ? "text-xs"
                                    : density === "compact"
                                      ? "text-[10px]"
                                      : "text-[9px]",
                                )}
                              >
                                {table.table_number}
                              </span>
                              <span
                                className={cn(
                                  "flex items-center justify-center rounded-full text-white shadow-sm",
                                  density === "tight" ? "h-4 w-4" : "h-5 w-5",
                                  marker.dot,
                                )}
                                title={surfaceState.label}
                              >
                                <StatusIcon
                                  className={
                                    density === "tight"
                                      ? "h-2.5 w-2.5"
                                      : "h-3 w-3"
                                  }
                                />
                                <span className="sr-only">
                                  {surfaceState.label}
                                </span>
                              </span>
                              {table.layout.locked && isSelected ? (
                                <LockKeyhole
                                  className="absolute right-0 top-0 h-3.5 w-3.5 text-stone-600"
                                  aria-label="Position verrouillée"
                                />
                              ) : null}
                            </div>
                            {(primaryAssignment || serviceState.detail) &&
                            density !== "tight" ? (
                              <button
                                type="button"
                                title={
                                  primaryAssignment
                                    ? getCompactReservationCustomerLabel(
                                        primaryAssignment,
                                        "regular",
                                      )
                                    : undefined
                                }
                                aria-label={
                                  primaryAssignment
                                    ? `Voir ${getReservationCustomerLabel(primaryAssignment)}, ${getSafeTime(primaryAssignment.time)}, ${primaryAssignment.party_size} personnes`
                                    : undefined
                                }
                                className="absolute left-1/2 top-[calc(100%+4px)] z-10 max-w-[150px] -translate-x-1/2 whitespace-nowrap rounded-md border border-white/90 bg-white/95 px-2 py-1 text-center text-[9px] font-medium text-stone-700 shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (primaryAssignment)
                                    onPrimaryReservationPress(
                                      primaryAssignment.id,
                                      table.id,
                                    );
                                }}
                              >
                                {serviceState.detail &&
                                ![
                                  "upcoming",
                                  "arrived",
                                  "zero-attente",
                                ].includes(serviceState.key)
                                  ? serviceState.detail
                                  : primaryAssignment
                                    ? `${getSafeTime(primaryAssignment.time)} · ${primaryAssignment.party_size} pers.`
                                    : serviceState.detail}
                                {assignments.length > 1 &&
                                serviceState.key !== "conflict" ? (
                                  <span> · +{assignments.length - 1}</span>
                                ) : null}
                              </button>
                            ) : null}
                            {isDragTarget && draggedReservationId ? (
                              <div
                                className={cn(
                                  "absolute -bottom-10 left-1/2 z-20 w-max max-w-[180px] -translate-x-1/2 rounded-lg border px-2 py-1 text-center text-[10px] font-semibold shadow-sm",
                                  canDropHere
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-rose-200 bg-rose-50 text-rose-800",
                                )}
                              >
                                {canDropHere
                                  ? "Affecter ici"
                                  : getReservationDropState(
                                      draggedReservationId,
                                      table.id,
                                    ).reason}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {isSelected && canAdjust ? (
                          <>
                            <button
                              type="button"
                              aria-label={`Déplacer ${table.table_number}`}
                              className="absolute left-1 top-1 flex h-10 w-10 touch-none items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm xl:h-8 xl:w-8"
                              onPointerDown={(event) =>
                                onStartDraggingTable(event, table.id)
                              }
                            >
                              <Grip className="h-3.5 w-3.5" />
                            </button>
                            {SERVICE_RESIZE_HANDLES.map((handle) => (
                              <button
                                key={handle.key}
                                type="button"
                                aria-label={`Redimensionner ${table.table_number}`}
                                className={cn(
                                  "absolute h-9 w-9 touch-none rounded-full border border-stone-200 bg-white shadow-sm xl:h-7 xl:w-7",
                                  handle.className,
                                )}
                                style={{ cursor: handle.cursor }}
                                onPointerDown={(event) =>
                                  onStartResizingTable(
                                    event,
                                    table.id,
                                    handle.key,
                                  )
                                }
                              >
                                <span className="absolute inset-[9px] rounded-full bg-stone-600" />
                              </button>
                            ))}
                          </>
                        ) : null}
                      </div>
                      {isSelected && canAdjust ? (
                        <button
                          type="button"
                          aria-label={`Faire pivoter ${table.table_number}`}
                          className="absolute -top-10 left-1/2 flex h-9 w-9 -translate-x-1/2 touch-none items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm"
                          onPointerDown={(event) =>
                            onStartRotatingTable(event, table.id)
                          }
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {selectedTable && selectedPrimary ? (
          <div
            className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/50 p-3 dark:border-border dark:bg-muted/20"
            aria-label={`Actions pour ${selectedTable.table_number}`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {`${selectedTable.table_number} · ${getReservationCustomerLabel(selectedPrimary)}`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {`${getSafeTime(selectedPrimary.time)} · ${selectedPrimary.party_size} personnes`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedStatus === "pending" ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-10 rounded-lg text-xs"
                  aria-label={`Confirmer ${getReservationCustomerLabel(selectedPrimary)}`}
                  onClick={() =>
                    onReservationStatusChange(selectedPrimary.id, "confirmed")
                  }
                >
                  Confirmer
                </Button>
              ) : null}
              {selectedStatus === "confirmed" ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-10 rounded-lg text-xs"
                  aria-label={`Marquer ${getReservationCustomerLabel(selectedPrimary)} arrive`}
                  onClick={() =>
                    onReservationStatusChange(selectedPrimary.id, "arrived")
                  }
                >
                  Marquer l’arrivée
                </Button>
              ) : null}
              {["confirmed", "arrived"].includes(selectedStatus) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-lg text-xs"
                  aria-label={`Installer ${getReservationCustomerLabel(selectedPrimary)}`}
                  onClick={() =>
                    onReservationStatusChange(selectedPrimary.id, "seated")
                  }
                >
                  Installer
                </Button>
              ) : null}
              {selectedStatus === "confirmed" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 rounded-lg text-xs text-stone-500"
                  aria-label={`Marquer ${getReservationCustomerLabel(selectedPrimary)} no-show`}
                  onClick={() =>
                    onReservationStatusChange(selectedPrimary.id, "no_show")
                  }
                >
                  Absent
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 rounded-lg text-xs text-stone-500"
                aria-label={`Liberer ${selectedTable.table_number}`}
                onClick={() => onReleaseReservation(selectedPrimary.id)}
              >
                Libérer
              </Button>
            </div>
          </div>
        ) : null}
        <p className="mt-2 shrink-0 text-center text-[10px] text-stone-400 dark:text-muted-foreground">
          {adjustingPlan
            ? "Ajustement du plan du jour · les éléments verrouillés gardent leur position."
            : `${visibleTablesCount} éléments · Sélectionnez une table pour voir ses réservations.`}
        </p>
      </CardContent>
    </Card>
  );
}
