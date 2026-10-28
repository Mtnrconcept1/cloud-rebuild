import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  Grid2X2,
  Hand,
  LayoutPanelTop,
  LockKeyhole,
  Magnet,
  Maximize2,
  MousePointer2,
  Plus,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getFloorPlanInteractiveFrame,
  getFloorPlanItemResizeBehavior,
  isReservableFloorPlanItem,
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
import type {
  StudioDraftTable,
  StudioRenderedTableFrame,
} from "./studioShared";
import {
  useFloorPlanZoomViewport,
  FLOOR_PLAN_MIN_ZOOM,
  FLOOR_PLAN_MAX_ZOOM,
} from "./useFloorPlanZoomViewport";

const STUDIO_RESIZE_HANDLES = [
  { key: "nw", className: "-left-3 -top-3", cursor: "nwse-resize" },
  {
    key: "n",
    className: "left-1/2 -top-3 -translate-x-1/2",
    cursor: "ns-resize",
  },
  { key: "ne", className: "-right-3 -top-3", cursor: "nesw-resize" },
  {
    key: "e",
    className: "-right-3 top-1/2 -translate-y-1/2",
    cursor: "ew-resize",
  },
  { key: "se", className: "-right-3 -bottom-3", cursor: "nwse-resize" },
  {
    key: "s",
    className: "-bottom-3 left-1/2 -translate-x-1/2",
    cursor: "ns-resize",
  },
  { key: "sw", className: "-left-3 -bottom-3", cursor: "nesw-resize" },
  {
    key: "w",
    className: "-left-3 top-1/2 -translate-y-1/2",
    cursor: "ew-resize",
  },
] as const;

type StudioCanvasProps = {
  selectedSector: string;
  canvasWidth: number;
  canvasHeight: number;
  canvasZoom: number;
  canvasScale?: number;
  canvasZoomLabel: string;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  visibleTables: StudioDraftTable[];
  selectedTableId: string | null;
  draggingTableId: string | null;
  onTablePress: (tableId: string) => void;
  onCanvasBackgroundPress: () => void;
  onStartDraggingTable: (
    event: PointerEvent<HTMLElement>,
    tableId: string,
  ) => void;
  onStartResizingTable: (
    event: PointerEvent<HTMLButtonElement>,
    tableId: string,
    handle: (typeof STUDIO_RESIZE_HANDLES)[number]["key"],
  ) => void;
  onStartRotatingTable: (
    event: PointerEvent<HTMLElement>,
    tableId: string,
  ) => void;
  onUpdateCanvasZoom: (nextZoom: number) => void;
  onCanvasViewportResize: (width: number, height: number) => void;
  onNudgeTable?: (tableId: string, deltaX: number, deltaY: number) => void;
  onDeleteTable?: (tableId: string) => void;
  onOpenLibrary?: () => void;
  showGrid?: boolean;
  snapToGrid?: boolean;
  onShowGridChange?: (show: boolean) => void;
  onSnapToGridChange?: (snap: boolean) => void;
  getRenderedFrame: (table: StudioDraftTable) => StudioRenderedTableFrame;
};

export default function StudioCanvas({
  selectedSector,
  canvasWidth,
  canvasHeight,
  canvasZoom,
  canvasScale = 1,
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
  onOpenLibrary,
  showGrid = false,
  snapToGrid = false,
  onShowGridChange,
  onSnapToGridChange,
  getRenderedFrame,
}: StudioCanvasProps) {
  const [tool, setTool] = useState<"select" | "pan">("select");
  const panRef = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const scale = createFloorPlanSheetScale(canvasWidth, canvasHeight);
  const tables = visibleTables.filter((table) =>
    isReservableFloorPlanItem(table.layout.kind),
  );
  const covers = tables.reduce((sum, table) => sum + table.capacity, 0);

  useLayoutEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return undefined;
    let lastWidth = 0;
    let lastHeight = 0;
    const notifySize = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (
        width <= 0 ||
        height <= 0 ||
        (width === lastWidth && height === lastHeight)
      )
        return;
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

  const handleObjectKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    table: StudioDraftTable,
  ) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select"))
      return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTablePress(table.id);
      return;
    }
    if (table.id !== selectedTableId || table.layout.locked) return;
    const step = event.shiftKey ? 10 : 1;
    const delta = (
      {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      } as Record<string, number[]>
    )[event.key];
    if (delta) {
      event.preventDefault();
      onNudgeTable?.(table.id, delta[0], delta[1]);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDeleteTable?.(table.id);
    }
  };

  return (
    <Card className="fp-canvas flex h-[min(60svh,560px)] min-h-[320px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl sm:h-[min(75svh,800px)] xl:h-full xl:min-h-0">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg">{selectedSector}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tables.length} tables · {covers} couverts
          </p>
        </div>
        <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          Plan permanent
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col p-2">
        <div
          className="fp-canvas-tools absolute left-5 top-5 z-50 flex flex-col gap-1"
          role="toolbar"
          aria-label="Outils du plan"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Sélectionner"
            aria-label="Outil sélection"
            aria-pressed={tool === "select"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Déplacer la vue"
            aria-label="Déplacer la vue"
            aria-pressed={tool === "pan"}
            onClick={() => setTool("pan")}
          >
            <Hand className="h-4 w-4" />
          </Button>
          {onOpenLibrary ? (
            <>
              <div className="mx-2 h-px bg-border" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Ajouter du mobilier"
                aria-label="Ouvrir la bibliothèque"
                onClick={onOpenLibrary}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
        <div
          ref={canvasViewportRef}
          className={cn(
            "flex min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-xl p-1",
            tool === "pan" && "cursor-grab touch-none",
          )}
          role="region"
          aria-label={`Plan du secteur ${selectedSector}`}
          onPointerDown={(event) => {
            if (tool !== "pan" || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panRef.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
            };
          }}
          onPointerMove={(event) => {
            const pan = panRef.current;
            if (!pan || pan.id !== event.pointerId) return;
            event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x);
            event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y);
          }}
          onPointerUp={() => {
            panRef.current = null;
          }}
          onPointerCancel={() => {
            panRef.current = null;
          }}
        >
          <div
            className="m-auto shrink-0 overflow-hidden"
            style={{
              width: canvasWidth * canvasZoom * canvasScale,
              height: canvasHeight * canvasZoom * canvasScale,
            }}
          >
            <div
              ref={canvasRef}
              data-floor-plan-canvas="stage"
              className={FLOOR_PLAN_SHEET_STAGE_CLASS}
              style={{
                width: canvasWidth,
                height: canvasHeight,
                aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                transform: `scale(${canvasZoom * canvasScale})`,
                borderRadius: 10,
                backgroundColor: FLOOR_PLAN_SHEET_BACKGROUND,
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget && tool === "select")
                  onCanvasBackgroundPress();
              }}
            >
              <div
                className={FLOOR_PLAN_SHEET_WALL_CLASS}
                style={{
                  inset: scale(24, 3),
                  borderRadius: scale(12, 3),
                  borderWidth: scale(10, 3),
                }}
              />
              <div
                className={FLOOR_PLAN_SHEET_FLOOR_CLASS}
                style={{ inset: scale(46, 6), borderRadius: scale(3, 1) }}
              />
              <div
                className={FLOOR_PLAN_SHEET_FLOOR_INLAY_CLASS}
                style={{ inset: scale(50, 7), borderRadius: scale(3, 1) }}
              />
              {showGrid ? (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    inset: scale(46, 6),
                    backgroundImage: FLOOR_PLAN_SHEET_GRID_IMAGE,
                    backgroundSize: "10px 10px",
                    backgroundPosition: "-46px -46px",
                  }}
                />
              ) : null}
              {visibleTables.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-16 text-center text-[#786d5d]">
                  <LayoutPanelTop className="h-10 w-10 opacity-50" />
                  <h3 className="font-display text-xl text-[#493d2f]">
                    Votre espace prend forme ici
                  </h3>
                  <p className="max-w-[260px] text-sm">
                    Ajoutez une table, une banquette ou un élément de décor.
                  </p>
                  {onOpenLibrary ? (
                    <Button
                      type="button"
                      onClick={onOpenLibrary}
                      className="mt-1 rounded-xl"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter un élément
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {visibleTables.map((table) => {
                const frame = getRenderedFrame(table);
                const hit = getFloorPlanInteractiveFrame(frame);
                const selected = table.id === selectedTableId;
                const locked = Boolean(table.layout.locked);
                return (
                  <div
                    key={table.id}
                    className="absolute select-none touch-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                    style={{
                      left: hit.x,
                      top: hit.y,
                      width: hit.w,
                      height: hit.h,
                      zIndex: table.layout.visualVariant === "table-plant"
                        ? 44
                        : selected
                          ? 40
                          : table.layout.visualVariant === "parasol"
                            ? 8
                            : 16,
                      cursor: locked
                        ? "pointer"
                        : draggingTableId === table.id
                          ? "grabbing"
                          : "grab",
                      pointerEvents: tool === "pan" ? "none" : "auto",
                    }}
                    onClick={() => onTablePress(table.id)}
                    onPointerDown={(event) => {
                      if (
                        !locked &&
                        !(event.target as HTMLElement).closest("button")
                      )
                        onStartDraggingTable(event, table.id);
                    }}
                    onKeyDown={(event) => handleObjectKeyDown(event, table)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Sélectionner ${table.table_number}${locked ? ", verrouillé" : ""}`}
                    aria-pressed={selected}
                  >
                    <div
                      className="absolute"
                      style={{
                        left: hit.visualOffsetX,
                        top: hit.visualOffsetY,
                        width: frame.w,
                        height: frame.h,
                        transform: `rotate(${table.layout.rotation}deg)`,
                        transformOrigin: "center",
                      }}
                    >
                      <FloorPlanItemIllustration
                        kind={table.layout.kind}
                        shape={table.layout.shape}
                        visualVariant={table.layout.visualVariant}
                        finish={table.layout.finish}
                        capacity={table.capacity}
                        seatType={table.layout.seatType}
                        seatPlacements={table.layout.seatPlacements}
                        cornerBenchCorners={table.layout.cornerBenchCorners}
                        cornerBenchConfigs={table.layout.cornerBenchConfigs}
                        tableWidth={table.layout.tableWidth}
                        tableHeight={table.layout.tableHeight}
                        cornerBenchHorizontal={
                          table.layout.cornerBenchHorizontal
                        }
                        cornerBenchVertical={table.layout.cornerBenchVertical}
                        cornerBenchDepth={table.layout.cornerBenchDepth}
                        className="pointer-events-none block h-full w-full"
                        preserveAspectRatio="none"
                      />
                      {selected ? (
                        <div className="pointer-events-none absolute -inset-1 rounded-md border border-[#e46737]" />
                      ) : null}
                      {selected && !locked
                        ? STUDIO_RESIZE_HANDLES.filter((handle) =>
                            getFloorPlanItemResizeBehavior(
                              table.layout.kind,
                              table.layout.shape,
                            ).handles.includes(handle.key),
                          ).map((handle) => (
                            <button
                              key={handle.key}
                              type="button"
                              aria-label={`Redimensionner ${table.table_number} ${handle.key}`}
                              className={cn(
                                "absolute flex h-6 w-6 touch-none items-center justify-center",
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
                              <span className="h-2 w-2 rounded-[2px] border border-[#e46737] bg-white" />
                            </button>
                          ))
                        : null}
                    </div>
                    {isReservableFloorPlanItem(table.layout.kind) ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="fp-item-label">
                          {table.table_number}
                        </span>
                      </div>
                    ) : null}
                    {selected && locked ? (
                      <span className="pointer-events-none absolute -right-2 -top-3 rounded-full bg-white p-1 shadow-sm">
                        <LockKeyhole className="h-3 w-3 text-[#8f7f6c]" />
                      </span>
                    ) : null}
                    {selected && !locked ? (
                      <button
                        type="button"
                        aria-label={`Tourner ${table.table_number}`}
                        className="absolute -top-10 left-1/2 flex h-8 w-8 -translate-x-1/2 touch-none items-center justify-center rounded-full border border-[#e5dacb] bg-white text-[#7d6d59] shadow-sm"
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
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 pb-0 pt-2">
          <div className="fp-canvas-tools flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={zoomOut}
              disabled={canvasZoom <= FLOOR_PLAN_MIN_ZOOM}
              aria-label="Réduire le zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <button
              type="button"
              className="!w-12 text-xs font-semibold"
              onClick={resetZoom}
              title="Ajuster le plan à la zone visible"
            >
              {canvasZoomLabel}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={zoomIn}
              disabled={canvasZoom >= FLOOR_PLAN_MAX_ZOOM}
              aria-label="Augmenter le zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={resetZoom}
              aria-label="Recentrer et ajuster le plan"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {onShowGridChange ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 gap-1.5 rounded-lg px-2 text-xs"
                aria-pressed={showGrid}
                onClick={() => onShowGridChange(!showGrid)}
              >
                <Grid2X2 className="h-3.5 w-3.5" />
                Grille
              </Button>
            ) : null}
            {onSnapToGridChange ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 gap-1.5 rounded-lg px-2 text-xs"
                aria-pressed={snapToGrid}
                onClick={() => onSnapToGridChange(!snapToGrid)}
              >
                <Magnet className="h-3.5 w-3.5" />
                Magnétisme
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
