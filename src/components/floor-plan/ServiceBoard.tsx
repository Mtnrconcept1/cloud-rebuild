import type { DragEvent, PointerEvent, RefObject, WheelEvent } from "react";
import { Grip, LayoutPanelTop, Minus, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FloorPlanResizeHandle } from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

import {
  type RenderedTableFrame,
  type ReservationDropState,
  type ServiceDraftTable,
  type ServiceReservation,
  getCompactReservationCustomerLabel,
  getReservationCustomerLabel,
  getSafeTime,
  getTableDensity,
  isZeroAttenteReservation,
} from "./serviceShared";

type ServiceBoardProps = {
  selectedSector: string;
  subtitle: string;
  activeReservationLabel: string | null;
  canvasWidth: number;
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
  onCanvasWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onCanvasDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onCanvasDrop: (event: DragEvent<HTMLDivElement>) => void;
  onCanvasDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onCanvasBackgroundPress: () => void;
  onStartDraggingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onStartResizingTable: (event: PointerEvent<HTMLButtonElement>, tableId: string, handle: FloorPlanResizeHandle) => void;
  onStartRotatingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onUpdateCanvasZoom: (nextZoom: number) => void;
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
  getRenderedFrame: (table: ServiceDraftTable) => RenderedTableFrame;
  getTableContentPadding: (
    layout: ServiceDraftTable["layout"],
    capacity: number,
    zoom: number,
  ) => { top: number; right: number; bottom: number; left: number };
};

const CANVAS_HEIGHT = 680;
const MIN_CANVAS_ZOOM = 0.1;
const MAX_CANVAS_ZOOM = 1.8;
const CANVAS_ZOOM_STEP = 0.1;
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
          label: "Zero Attente",
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

export default function ServiceBoard({
  selectedSector,
  subtitle,
  activeReservationLabel,
  canvasWidth,
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
  onCanvasWheel,
  onCanvasDragOver,
  onCanvasDrop,
  onCanvasDragLeave,
  onCanvasBackgroundPress,
  onStartDraggingTable,
  onStartResizingTable,
  onStartRotatingTable,
  onUpdateCanvasZoom,
  getReservationDropState,
  getRenderedFrame,
  getTableContentPadding,
}: ServiceBoardProps) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,246,251,0.97))] shadow-[0_36px_110px_-48px_rgba(15,23,42,0.42)]">
      <CardHeader className="space-y-4 border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,252,0.88))] pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-[1.5rem] text-slate-950">{selectedSector}</CardTitle>
            <CardDescription className="mt-1 text-slate-500">{subtitle}</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-1 py-1 shadow-sm">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => onUpdateCanvasZoom(canvasZoom - CANVAS_ZOOM_STEP)}
                disabled={canvasZoom <= MIN_CANVAS_ZOOM}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="min-w-14 text-center text-sm font-semibold">{canvasZoomLabel}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => onUpdateCanvasZoom(1)}
                disabled={canvasZoom === 1}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => onUpdateCanvasZoom(canvasZoom + CANVAS_ZOOM_STEP)}
                disabled={canvasZoom >= MAX_CANVAS_ZOOM}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tables visibles</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{visibleTablesCount}</p>
          </div>
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Disponibles</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{availableTablesCount}</p>
          </div>
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Sans table</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{unassignedReservationsCount}</p>
          </div>
        </div>

        {activeReservationLabel ? (
          <div className="flex items-start gap-3 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
              <Grip className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Placement en cours</p>
              <p className="mt-1 truncate text-sm font-semibold text-amber-950">{activeReservationLabel}</p>
              <p className="text-sm text-amber-800">Glissez vers une table ou touchez une table compatible pour la déposer.</p>
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(250,251,253,1),rgba(241,244,248,1))] p-4">
          <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-slate-200/80 bg-white/80 p-3 shadow-inner">
            <div className="flex items-center justify-between gap-3 px-2 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <LayoutPanelTop className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Surface de service</p>
                  <p className="text-sm text-slate-500">Un tap pour sélectionner, un second pour affecter.</p>
                </div>
              </div>

              <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                Zoom {canvasZoomLabel}
              </Badge>
            </div>

            <div ref={canvasViewportRef} className="min-h-0 min-w-0 flex-1">
              <ScrollArea className="h-full w-full">
                <div
                  ref={canvasRef}
                  className="relative overflow-hidden rounded-[28px] border border-slate-300/70 shadow-inner"
                  onWheelCapture={onCanvasWheel}
                  onDragOver={onCanvasDragOver}
                  onDrop={onCanvasDrop}
                  onDragLeave={onCanvasDragLeave}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      onCanvasBackgroundPress();
                    }
                  }}
                  style={{
                    width: canvasWidth,
                    height: CANVAS_HEIGHT,
                    backgroundImage: "linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)",
                    backgroundSize: "36px 36px, 36px 36px",
                    backgroundColor: "#f6f7fb",
                  }}
                >
                  <div className="pointer-events-none absolute inset-[24px] rounded-[36px] border-[16px] border-[#36373d]" />
                  <div className="pointer-events-none absolute inset-[46px] rounded-[26px] bg-[linear-gradient(145deg,rgba(225,192,149,0.9),rgba(192,151,111,0.92))]" />
                  <div className="pointer-events-none absolute inset-[64px] rounded-[16px] border border-white/25" />

                  {visibleTables.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-slate-500">
                      <LayoutPanelTop className="h-10 w-10 text-primary/60" />
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">Aucun élément dans ce secteur</p>
                        <p className="text-sm">Passez en mode structure pour ajouter des tables et du mobilier.</p>
                      </div>
                    </div>
                  ) : null}

                  {visibleTables.map((table) => {
                    const assignments = visibleAssignmentsByTable.get(table.id) || [];
                    const primaryAssignment = assignments[0] || null;
                    const renderedFrame = getRenderedFrame(table);
                    const density = getTableDensity(renderedFrame);
                    const isReservable = table.capacity > 0;
                    const contentPadding = isReservable
                      ? getTableContentPadding(table.layout, table.capacity, canvasZoom)
                      : { top: 0, right: 0, bottom: 0, left: 0 };
                    const selectedReservationDropState = selectedReservationId && isReservable
                      ? getReservationDropState(selectedReservationId, table.id)
                      : null;
                    const surfaceState = getSurfaceState({
                      isReservable,
                      assignmentsCount: assignments.length,
                      isZeroAttentePrimary: primaryAssignment ? isZeroAttenteReservation(primaryAssignment) : false,
                      selectedReservationDropState,
                    });
                    const isSelected = table.id === selectedTableId;
                    const isDragTarget = dragOverTableId === table.id && !!draggedReservationId;
                    const canDropHere = draggedReservationId && isReservable
                      ? getReservationDropState(draggedReservationId, table.id).ok
                      : false;

                    return (
                      <div
                        key={table.id}
                        className="absolute select-none focus:outline-none"
                        style={{
                          left: renderedFrame.x,
                          top: renderedFrame.y,
                          width: renderedFrame.w,
                          height: renderedFrame.h,
                          zIndex: isSelected ? 40 : assignments.length > 0 ? 24 : 12,
                        }}
                        onClick={() => onTablePress(table.id)}
                      >
                        <div className={cn(
                          "pointer-events-none absolute inset-0 rounded-[28px] blur-[16px]",
                          surfaceState.haloClass,
                          isSelected && "scale-110 opacity-95",
                          !isSelected && "opacity-80",
                        )} />

                        <div
                          className="relative h-full w-full"
                          style={{
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
                            <div className="pointer-events-none absolute inset-[-3px] rounded-[24px] border-2 border-slate-950/70 shadow-[0_0_0_4px_rgba(255,255,255,0.6)]" />
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
                              className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-slate-900/15 bg-white shadow-md"
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
                                  "absolute h-3.5 w-3.5 rounded-full border border-slate-900/15 bg-white shadow-sm",
                                  handle.className,
                                )}
                                style={{ cursor: handle.cursor }}
                                onPointerDown={(event) => onStartResizingTable(event, table.id, handle.key)}
                              />
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
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-900/15 bg-white shadow-md">
                              <RotateCw className="h-3.5 w-3.5 text-slate-700" />
                            </div>
                            <div className="absolute top-6 h-2 w-px bg-slate-900/25" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-xs text-slate-500 shadow-sm">
            Sélectionnez une réservation puis une table compatible. Les poignées apparaissent seulement sur la table active.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
