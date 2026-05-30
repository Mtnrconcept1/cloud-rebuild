import type { KeyboardEvent, PointerEvent, RefObject, WheelEvent } from "react";
import { Grip, LayoutPanelTop, Minus, Move, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFloorPlanInteractiveFrame, getFloorPlanItemResizeBehavior, isReservableFloorPlanItem } from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

import type { StudioDraftTable, StudioRenderedTableFrame } from "./studioShared";

const CANVAS_HEIGHT = 680;
const MIN_CANVAS_ZOOM = 0.1;
const MAX_CANVAS_ZOOM = 1.8;
const CANVAS_ZOOM_STEP = 0.1;
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
  canvasZoom: number;
  canvasZoomLabel: string;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  visibleTables: StudioDraftTable[];
  selectedTableId: string | null;
  draggingTableId: string | null;
  onTablePress: (tableId: string) => void;
  onCanvasWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onCanvasBackgroundPress: () => void;
  onStartDraggingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onStartResizingTable: (
    event: PointerEvent<HTMLButtonElement>,
    tableId: string,
    handle: (typeof STUDIO_RESIZE_HANDLES)[number]["key"],
  ) => void;
  onStartRotatingTable: (event: PointerEvent<HTMLElement>, tableId: string) => void;
  onUpdateCanvasZoom: (nextZoom: number) => void;
  onNudgeTable?: (tableId: string, deltaX: number, deltaY: number) => void;
  onDeleteTable?: (tableId: string) => void;
  getRenderedFrame: (table: StudioDraftTable) => StudioRenderedTableFrame;
};

export default function StudioCanvas({
  selectedSector,
  canvasWidth,
  canvasZoom,
  canvasZoomLabel,
  canvasRef,
  canvasViewportRef,
  visibleTables,
  selectedTableId,
  draggingTableId,
  onTablePress,
  onCanvasWheel,
  onCanvasBackgroundPress,
  onStartDraggingTable,
  onStartResizingTable,
  onStartRotatingTable,
  onUpdateCanvasZoom,
  onNudgeTable,
  onDeleteTable,
  getRenderedFrame,
}: StudioCanvasProps) {
  const recenterCanvas = () => {
    onUpdateCanvasZoom(1);

    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const nextLeft = Math.max(0, (canvasWidth - viewport.clientWidth) / 2);
    const nextTop = Math.max(0, (CANVAS_HEIGHT - viewport.clientHeight) / 2);
    viewport.scrollTo({
      left: nextLeft,
      top: nextTop,
      behavior: "smooth",
    });
  };

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
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,246,251,0.97))] shadow-[0_36px_110px_-48px_rgba(15,23,42,0.42)]">
      <CardHeader className="space-y-4 border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,252,0.88))] pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-[1.45rem] text-slate-950">{selectedSector}</CardTitle>
            <CardDescription className="mt-1 text-slate-500">
              Atelier de composition du template. Le canevas garde la priorité, les réglages passent en second plan.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
              Template global
            </Badge>
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
            <Button type="button" variant="outline" className="rounded-2xl border-slate-200 bg-white" onClick={recenterCanvas}>
              <Move className="mr-2 h-4 w-4" />
              Recentrer
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Elements</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{visibleTables.length}</p>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tables</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {visibleTables.filter((table) => isReservableFloorPlanItem(table.layout.kind)).length}
            </p>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mobilier</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {visibleTables.filter((table) => !isReservableFloorPlanItem(table.layout.kind)).length}
            </p>
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,1),rgba(241,244,248,1))] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <LayoutPanelTop className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Plan du template</p>
                <p className="text-sm text-slate-500">Glissez, redimensionnez ou configurez depuis l'inspecteur.</p>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
              Scroll local actif
            </Badge>
          </div>

          <div ref={canvasViewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto rounded-[26px] border border-slate-200/80 bg-white/80 p-3 shadow-inner">
            <div className="flex min-h-full min-w-full items-start justify-start">
              <div
                ref={canvasRef}
                className="relative overflow-hidden rounded-[28px] border border-slate-300/70 shadow-inner"
                onWheelCapture={onCanvasWheel}
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
                      <p className="font-medium text-slate-900">Aucun element dans ce secteur</p>
                      <p className="text-sm">Ajoutez des presets depuis la palette pour commencer a construire la salle.</p>
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
                      aria-label={`Selectionner ${table.table_number}`}
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
                            aria-label={`Deplacer ${table.table_number}`}
                            className="absolute left-[-12px] top-1/2 flex h-10 w-10 touch-none -translate-y-1/2 items-center justify-center rounded-full border border-slate-900/10 bg-white text-slate-700 shadow-[0_18px_28px_-18px_rgba(15,23,42,0.55)]"
                            onPointerDown={(event) => onStartDraggingTable(event, table.id)}
                          >
                            <Grip className="h-4 w-4" />
                          </button>
                        ) : null}

                        {isSelected
                          ? (() => {
                            const resizeBehavior = getFloorPlanItemResizeBehavior(table.layout.kind);
                            return STUDIO_RESIZE_HANDLES
                              .filter((handle) => resizeBehavior.handles.includes(handle.key))
                              .map((handle) => (
                              <button
                                key={handle.key}
                                type="button"
                                aria-label={`Redimensionner ${table.table_number}`}
                                className={cn(
                                  "absolute h-7 w-7 touch-none rounded-full border-2 border-white bg-slate-950/92 shadow-[0_18px_28px_-18px_rgba(15,23,42,0.7)] transition-transform hover:scale-110",
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
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-900/10 bg-white shadow-[0_18px_28px_-18px_rgba(15,23,42,0.55)]">
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

        <div className="mt-4 flex justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-xs text-slate-500 shadow-sm">
            Le canevas garde son scroll local. Les panneaux se compactent avant de rogner la surface de travail.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
