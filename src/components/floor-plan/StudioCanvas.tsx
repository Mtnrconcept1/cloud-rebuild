import { useEffect, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { Grip, LayoutPanelTop, Move, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFloorPlanInteractiveFrame, getFloorPlanItemResizeBehavior, isReservableFloorPlanItem } from "@/lib/floorPlan";
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
import type { StudioDraftTable, StudioRenderedTableFrame } from "./studioShared";
import { useFloorPlanZoomViewport, FLOOR_PLAN_MIN_ZOOM, FLOOR_PLAN_MAX_ZOOM } from "./useFloorPlanZoomViewport";

const STUDIO_RESIZE_HANDLES = [
  { key: "nw", className: "-left-2.5 -top-2.5", cursor: "nwse-resize" },
  { key: "n", className: "left-1/2 -top-2.5 -translate-x-1/2", cursor: "ns-resize" },
  { key: "ne", className: "-right-2.5 -top-2.5", cursor: "nesw-resize" },
  { key: "e", className: "-right-2.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { key: "se", className: "-right-2.5 -bottom-2.5", cursor: "nwse-resize" },
  { key: "s", className: "-bottom-2.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { key: "sw", className: "-left-2.5 -bottom-2.5", cursor: "nesw-resize" },
  { key: "w", className: "-left-2.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
] as const;

type StudioCanvasProps = {
  selectedSector: string;
  canvasWidth: number;
  canvasHeight: number;
  canvasZoom: number;
  canvasZoomLabel: string;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  visibleTables: StudioDraftTable[];
  selectedTableId: string | null;
  draggingTableId: string | null;
  onTablePress: (tableId: string) => void;
  onCanvasBackgroundPress: () => void;
  onStartDraggingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onStartResizingTable: (
    event: PointerEvent<HTMLButtonElement>,
    tableId: string,
    handle: (typeof STUDIO_RESIZE_HANDLES)[number]["key"],
  ) => void;
  onStartRotatingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onUpdateCanvasZoom: (nextZoom: number) => void;
  onCanvasViewportResize: (width: number, height: number) => void;
  onNudgeTable?: (tableId: string, deltaX: number, deltaY: number) => void;
  onDeleteTable?: (tableId: string) => void;
  getRenderedFrame: (table: StudioDraftTable) => StudioRenderedTableFrame;
};

export default function StudioCanvas({
  selectedSector,
  canvasWidth,
  canvasHeight,
  canvasZoom,
  canvasZoomLabel,
  canvasRef,
  canvasViewportRef,
  visibleTables,
  selectedTableId,
  draggingTableId,
  onTablePress,
  onCanvasBackgroundPress,
  onStartDraggingTable,
  onStartResizingTable,
  onStartRotatingTable,
  onUpdateCanvasZoom,
  onCanvasViewportResize,
  onNudgeTable,
  onDeleteTable,
  getRenderedFrame,
}: StudioCanvasProps) {
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

  const { zoomIn, zoomOut, resetZoom, recenter } = useFloorPlanZoomViewport({
    viewportRef: canvasViewportRef,
    zoom: canvasZoom,
    onZoomChange: onUpdateCanvasZoom,
  });

  const startObjectSurfaceDrag = (
    event: PointerEvent<HTMLDivElement>,
    table: StudioDraftTable,
  ) => {
    if ((event.target as HTMLElement).closest("button")) return;
    onStartDraggingTable(event, table.id);
  };

  const handleObjectKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    table: StudioDraftTable,
  ) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select")) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTablePress(table.id);
      return;
    }

    if (table.id !== selectedTableId) return;

    const step = event.shiftKey ? 10 : 1;
    const deltas: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];

    if (delta) {
      event.preventDefault();
      onNudgeTable?.(table.id, delta[0], delta[1]);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDeleteTable?.(table.id);
    }
  };

  return (
    <Card className="flex h-[min(68svh,680px)] min-h-[430px] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:h-full xl:min-h-0">
      <CardHeader className="border-b border-border/70 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg text-foreground">{selectedSector}</CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">Touchez un élément, puis déplacez-le ou ouvrez ses réglages.</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-border bg-card text-muted-foreground">
              Template global
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
            <Button type="button" variant="outline" className="h-11 rounded-2xl border-border bg-card" onClick={recenter}>
              <Move className="mr-2 h-4 w-4" />
              Recentrer
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted p-2">
          <div ref={canvasViewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-border/70 bg-background/60 shadow-inner" role="region" aria-label={`Plan du secteur ${selectedSector}`}>
            <div style={{ width: canvasWidth * canvasZoom, height: canvasHeight * canvasZoom }}>
              <div
                ref={canvasRef}
                data-floor-plan-canvas="stage"
                className={FLOOR_PLAN_SHEET_STAGE_CLASS}
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
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    onCanvasBackgroundPress();
                  }
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
                      <p className="max-w-[260px] text-sm">Utilisez « Ajouter » sous le plan pour poser votre première table.</p>
                    </div>
                  </div>
                ) : null}

                {visibleTables.map((table) => {
                  const renderedFrame = getRenderedFrame(table);
                  const interactiveFrame = getFloorPlanInteractiveFrame(renderedFrame);
                  const isSelected = table.id === selectedTableId;
                  const isReservable = isReservableFloorPlanItem(table.layout.kind);

                  return (
                    <div
                      key={table.id}
                      className="absolute select-none touch-none focus:outline-none"
                      style={{
                        left: interactiveFrame.x,
                        top: interactiveFrame.y,
                        width: interactiveFrame.w,
                        height: interactiveFrame.h,
                        zIndex: isSelected ? 40 : 16,
                        cursor: draggingTableId === table.id ? "grabbing" : "grab",
                        willChange: draggingTableId === table.id ? "left, top" : undefined,
                      }}
                      onClick={() => onTablePress(table.id)}
                      onPointerDown={(event) => startObjectSurfaceDrag(event, table)}
                      onKeyDown={(event) => handleObjectKeyDown(event, table)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Sélectionner ${table.table_number}`}
                      aria-pressed={isSelected}
                    >
                      <div className={cn(
                        "pointer-events-none absolute inset-1 rounded-[30px] blur-[18px]",
                        isSelected ? "bg-orange-300/55 opacity-95" : "bg-slate-300/30 opacity-70",
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
                            className="block h-full w-full"
                            preserveAspectRatio="none"
                          />
                        </div>

                        {isSelected ? (
                          <>
                            <div className="pointer-events-none absolute inset-[-5px] rounded-[30px] border-2 border-orange-500/75 shadow-[0_0_0_4px_rgba(255,255,255,0.72)]" />
                            <div className="pointer-events-none absolute inset-[8px] rounded-[20px] border border-white/55" />
                          </>
                        ) : null}

                        {isReservable ? (
                          <div className="pointer-events-none absolute inset-x-3 top-2 flex justify-center">
                            <div className="rounded-full border border-white/90 bg-white/92 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-800 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.5)]">
                              {table.table_number}
                            </div>
                          </div>
                        ) : null}

                        {isSelected ? (
                          <button
                            type="button"
                            aria-label={`Déplacer ${table.table_number}`}
                            className="absolute left-[-12px] top-1/2 flex h-11 w-11 touch-none -translate-y-1/2 items-center justify-center rounded-full border border-slate-900/10 bg-white text-slate-700 shadow-[0_18px_28px_-18px_rgba(15,23,42,0.55)] sm:h-10 sm:w-10"
                            onPointerDown={(event) => onStartDraggingTable(event, table.id)}
                          >
                            <Grip className="h-4 w-4" />
                          </button>
                        ) : null}

                        {isSelected
                          ? (() => {
                            const resizeBehavior = getFloorPlanItemResizeBehavior(table.layout.kind, table.layout.shape);
                            return STUDIO_RESIZE_HANDLES
                              .filter((handle) => resizeBehavior.handles.includes(handle.key))
                              .map((handle) => (
                              <button
                                key={handle.key}
                                type="button"
                                aria-label={`Redimensionner ${table.table_number}`}
                                className={cn(
                                  "absolute h-10 w-10 touch-none rounded-full border-2 border-white bg-slate-950/92 shadow-[0_18px_28px_-18px_rgba(15,23,42,0.7)] transition-transform hover:scale-110 sm:h-8 sm:w-8",
                                  handle.className,
                                )}
                                style={{ cursor: handle.cursor }}
                                onPointerDown={(event) => onStartResizingTable(event, table.id, handle.key)}
                              >
                                <span className="absolute inset-[8px] rounded-full bg-orange-300/95" />
                              </button>
                            ));
                          })()
                          : null}
                      </div>

                      {isSelected ? (
                        <div
                          className="absolute flex items-center justify-center"
                          style={{
                            top: -34,
                            left: "50%",
                            transform: "translateX(-50%)",
                            cursor: "grab",
                          }}
                          onPointerDown={(event) => onStartRotatingTable(event, table.id)}
                        >
                          <div className="flex h-11 w-11 touch-none items-center justify-center rounded-full border border-slate-900/10 bg-white shadow-[0_18px_28px_-18px_rgba(15,23,42,0.55)] sm:h-9 sm:w-9">
                            <RotateCw className="h-4 w-4 text-slate-700" />
                          </div>
                          <div className="absolute top-9 h-3 w-px bg-slate-900/20" />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
