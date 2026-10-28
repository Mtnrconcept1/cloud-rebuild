import type {
  FloorPlanCornerBenchConfig,
  FloorPlanCornerBenchCorner,
  FloorPlanItemKind,
  FloorPlanSeatPlacement,
  FloorPlanSeatType,
  FloorPlanTableFinish,
  FloorPlanTableShape,
  FloorPlanVisualVariant,
} from "@/lib/floorPlan";
import { cn } from "@/lib/utils";
import DynamicTableSvg from "./DynamicTableSvg";
import { getResolvedFloorPlanDimensions } from "@/lib/floorPlan";
import { DancefloorSvg, DjBoothSvg, StageSvg } from "./EventFurnitureSvg";
import { FloorPlanAssetSprite } from "./FloorPlanAssetSprite";
import {
  getFloorPlanAssetAspectRatio,
  getFloorPlanItemAssetId,
} from "./floorPlanAssets";
import { FLOOR_PLAN_PREVIEW_TILE_CLASS } from "./floorPlanSheet";

export type FloorPlanItemIllustrationProps = {
  kind: FloorPlanItemKind;
  shape?: FloorPlanTableShape;
  className?: string;
  decorative?: boolean;
  preserveAspectRatio?: string;
  capacity?: number;
  seatType?: FloorPlanSeatType;
  seatPlacements?: FloorPlanSeatPlacement[];
  cornerBenchCorners?: FloorPlanCornerBenchCorner[];
  cornerBenchConfigs?: FloorPlanCornerBenchConfig[];
  tableWidth?: number;
  tableHeight?: number;
  cornerBenchHorizontal?: number;
  cornerBenchVertical?: number;
  cornerBenchDepth?: number;
  visualVariant?: FloorPlanVisualVariant;
  finish?: FloorPlanTableFinish;
};

function BoothSvg({ finish }: { finish?: FloorPlanTableFinish }) {
  return (
    <>
      <FloorPlanAssetSprite
        assetId="banquette-straight"
        x={-38}
        y={56}
        width={136}
        height={40}
        rotation={270}
        fit="stretch"
      />
      <FloorPlanAssetSprite
        assetId="banquette-straight"
        x={122}
        y={56}
        width={136}
        height={40}
        rotation={90}
        fit="stretch"
      />
      <FloorPlanAssetSprite
        assetId="square-table-top"
        x={66}
        y={24}
        width={88}
        height={104}
        fit="stretch"
        finish={finish}
      />
    </>
  );
}

export function FloorPlanItemIllustration({
  className,
  decorative = true,
  preserveAspectRatio = "xMidYMid meet",
  shape = "rect",
  ...props
}: FloorPlanItemIllustrationProps) {
  const dynamic = props.kind === "table" && (props.capacity || 0) > 0;
  const dynamicProps = { ...props, shape, capacity: props.capacity || 1 };
  const resolved = dynamic
    ? getResolvedFloorPlanDimensions({
        ...dynamicProps,
        capacity: Math.max(1, Math.min(32, Math.round(dynamicProps.capacity))),
      })
    : null;
  const assetId = getFloorPlanItemAssetId({ ...props, shape });
  const naturalRatio = assetId
    ? getFloorPlanAssetAspectRatio(assetId)
    : 200 / 140;
  // The viewBox follows the actual footprint. A 200×140 viewBox stretched into
  // every item used to squash circular tables and give chairs inconsistent scale.
  const width =
    resolved?.footprintWidth ??
    (assetId
      ? props.tableWidth || naturalRatio * 100
      : props.kind === "booth"
        ? 220
        : 200);
  const height =
    resolved?.footprintHeight ??
    (assetId ? props.tableHeight || 100 : props.kind === "booth" ? 152 : 140);
  const adaptable =
    (props.kind === "table" && shape === "rect") ||
    props.kind === "banquette" ||
    props.kind === "sofa" ||
    props.kind === "bar" ||
    props.visualVariant === "wall" ||
    props.visualVariant === "window";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block h-full w-full overflow-visible", className)}
      fill="none"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative}
      preserveAspectRatio={
        preserveAspectRatio === "none" && !adaptable && !dynamic
          ? "xMidYMid meet"
          : preserveAspectRatio
      }
      overflow="visible"
      data-floor-plan-illustration={props.kind}
    >
      {dynamic ? (
        <DynamicTableSvg
          {...dynamicProps}
          viewportWidth={width}
          viewportHeight={height}
        />
      ) : assetId ? (
        <FloorPlanAssetSprite
          assetId={assetId}
          x={0}
          y={0}
          width={width}
          height={height}
          fit={adaptable ? "stretch" : "contain"}
          finish={props.kind === "table" ? props.finish : undefined}
        />
      ) : props.kind === "booth" ? (
        <BoothSvg finish={props.finish} />
      ) : props.kind === "dancefloor" ? (
        <DancefloorSvg />
      ) : props.kind === "dj-booth" ? (
        <DjBoothSvg />
      ) : props.kind === "stage" ? (
        <StageSvg />
      ) : null}
    </svg>
  );
}

export function FloorPlanPresetIcon({
  className,
  ...props
}: FloorPlanItemIllustrationProps) {
  return (
    <div
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-[22px] border p-2 shadow-sm",
        FLOOR_PLAN_PREVIEW_TILE_CLASS,
        className,
      )}
    >
      <FloorPlanItemIllustration {...props} className="block h-full w-full" />
    </div>
  );
}
