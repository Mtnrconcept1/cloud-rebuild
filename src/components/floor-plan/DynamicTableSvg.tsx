import {
  type FloorPlanCornerBenchConfig,
  type FloorPlanCornerBenchCorner,
  type FloorPlanRectSeatZone,
  type FloorPlanResolvedDimensions,
  type FloorPlanRoundSeatZone,
  type FloorPlanSeatPlacement,
  type FloorPlanSeatType,
  type FloorPlanTableFinish,
  type FloorPlanTableShape,
  type FloorPlanVisualVariant,
  getResolvedFloorPlanDimensions,
} from "@/lib/floorPlan";
import { type SeatPosition } from "./seatPositioning";
import {
  FLOOR_PLAN_ASSETS,
  getFloorPlanAssetAspectRatio,
  getFloorPlanAssetRect,
} from "./floorPlanAssets";
import { FloorPlanAssetSprite } from "./FloorPlanAssetSprite";

const RECT_CORNER_GAP = 10;
const CHAIR_DEPTH = 35;
const STOOL_DEPTH = 28;
const ROUND_ZONE_POLAR_ANGLES: Record<FloorPlanRoundSeatZone, number> = {
  north: -90,
  "north-east": -45,
  east: 0,
  "south-east": 45,
  south: 90,
  "south-west": 135,
  west: 180,
  "north-west": 225,
};
const SIDE_ROTATIONS: Record<FloorPlanRectSeatZone, number> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
};

type TableRect = { x: number; y: number; w: number; h: number };
export type DynamicTableSvgProps = {
  shape: FloorPlanTableShape;
  capacity: number;
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
  viewportWidth?: number;
  viewportHeight?: number;
};

function getDynamicTableDimensions(props: DynamicTableSvgProps) {
  return getResolvedFloorPlanDimensions({
    ...props,
    capacity: Math.max(1, Math.min(32, Math.round(props.capacity || 1))),
  });
}

function getScaledFrame(
  resolved: FloorPlanResolvedDimensions,
  width: number,
  height: number,
  padding: number,
) {
  const scale = Math.min(
    (width - padding * 2) / resolved.footprintWidth,
    (height - padding * 2) / resolved.footprintHeight,
  );
  const originX = (width - resolved.footprintWidth * scale) / 2;
  const originY = (height - resolved.footprintHeight * scale) / 2;
  return {
    scale,
    tableRect: {
      x: originX + resolved.paddingLeft * scale,
      y: originY + resolved.paddingTop * scale,
      w: resolved.tableWidth * scale,
      h: resolved.tableHeight * scale,
    },
  };
}

function Seat({
  pos,
  type,
  scale,
}: {
  pos: SeatPosition;
  type: "chair" | "stool";
  scale: number;
}) {
  const height = (type === "stool" ? STOOL_DEPTH : CHAIR_DEPTH) * scale;
  const width = height * getFloorPlanAssetAspectRatio(type);
  // Both source sprites face down at 0°. Rotations point the seat toward the table.
  return (
    <FloorPlanAssetSprite
      assetId={type}
      x={pos.x - width / 2}
      y={pos.y - height / 2}
      width={width}
      height={height}
      rotation={pos.angleDeg}
    />
  );
}

function getSeatOffset(
  type: FloorPlanSeatPlacement["type"],
  depth: number | undefined,
  scale: number,
) {
  return (
    (type === "bench"
      ? depth || 26
      : type === "stool"
        ? STOOL_DEPTH
        : CHAIR_DEPTH) *
    scale *
    0.36
  );
}

function createRoundZonePositions(
  zone: FloorPlanRoundSeatZone,
  count: number,
  cx: number,
  cy: number,
  orbit: number,
): SeatPosition[] {
  const spread = count === 1 ? 0 : Math.min(44, Math.max(18, 12 + count * 7));
  const first = ROUND_ZONE_POLAR_ANGLES[zone] - spread / 2;
  const step = count <= 1 ? 0 : spread / (count - 1);
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const angle = first + step * index;
    return {
      x: cx + orbit * Math.cos((angle * Math.PI) / 180),
      y: cy + orbit * Math.sin((angle * Math.PI) / 180),
      angleDeg: angle + 90,
    };
  });
}

function getRectCornerInset(
  side: FloorPlanRectSeatZone,
  configs: FloorPlanCornerBenchConfig[],
  scale: number,
) {
  const pair: Record<
    FloorPlanRectSeatZone,
    [FloorPlanCornerBenchCorner, FloorPlanCornerBenchCorner]
  > = {
    top: ["top-left", "top-right"],
    right: ["top-right", "bottom-right"],
    bottom: ["bottom-left", "bottom-right"],
    left: ["top-left", "bottom-left"],
  };
  const dimension =
    side === "top" || side === "bottom" ? "horizontal" : "vertical";
  const [start, end] = pair[side].map(
    (corner) =>
      ((configs.find((config) => config.corner === corner)?.[dimension] || 0) +
        RECT_CORNER_GAP) *
      scale,
  );
  return { start, end };
}

function createRectSidePositions(
  count: number,
  side: FloorPlanRectSeatZone,
  rect: TableRect,
  offset: number,
  start: number,
  end: number,
): SeatPosition[] {
  const horizontal = side === "top" || side === "bottom";
  const span = horizontal ? rect.w : rect.h;
  const available = Math.max(0, span - start - end);
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const position =
      available > 0
        ? start + (available * (index + 1)) / (count + 1)
        : span / 2;
    return {
      x: horizontal
        ? rect.x + position
        : side === "left"
          ? rect.x - offset
          : rect.x + rect.w + offset,
      y: horizontal
        ? side === "top"
          ? rect.y - offset
          : rect.y + rect.h + offset
        : rect.y + position,
      angleDeg: SIDE_ROTATIONS[side],
      side,
    };
  });
}

function RectBenchStrip({
  side,
  rect,
  start,
  end,
  length,
  depth,
}: {
  side: FloorPlanRectSeatZone;
  rect: TableRect;
  start: number;
  end: number;
  length: number;
  depth: number;
}) {
  const horizontal = side === "top" || side === "bottom";
  const available = Math.max(
    depth,
    (horizontal ? rect.w : rect.h) - start - end,
  );
  const span = Math.min(length, available);
  const offset = depth * 0.36;
  const cx = horizontal
    ? rect.x + start + available / 2
    : side === "left"
      ? rect.x - offset
      : rect.x + rect.w + offset;
  const cy = horizontal
    ? side === "top"
      ? rect.y - offset
      : rect.y + rect.h + offset
    : rect.y + start + available / 2;
  // Start from a horizontal bench, then rotate. Swapping its width/height before
  // rotation would turn a side bench across the table and distort its backrest.
  return (
    <FloorPlanAssetSprite
      assetId="banquette-straight"
      x={cx - span / 2}
      y={cy - depth / 2}
      width={span}
      height={depth}
      fit="stretch"
      rotation={SIDE_ROTATIONS[side]}
    />
  );
}

/**
 * Resize the two arms independently. Splitting the real L-shaped sprite at the
 * inside elbow preserves the seat depth as a longer arm is requested. The four
 * source regions include the complete transparent padding and shadow pixels.
 */
function CornerBenchShape({
  config,
  tableRect,
  scale,
}: {
  config: FloorPlanCornerBenchConfig;
  tableRect: TableRect;
  scale: number;
}) {
  const asset = FLOOR_PLAN_ASSETS["corner-bench"];
  const baseDepth = 56;
  const baseHorizontal = 92;
  const baseVertical = 86;
  const imageRect = getFloorPlanAssetRect(
    asset,
    {
      x: 0,
      y: 0,
      width: baseDepth + baseHorizontal,
      height: baseDepth + baseVertical,
    },
    "stretch",
  );
  const sourceX = [imageRect.x, baseDepth, imageRect.x + imageRect.width];
  const sourceY = [imageRect.y, baseDepth, imageRect.y + imageRect.height];
  const sx = [config.depth / baseDepth, config.horizontal / baseHorizontal];
  const sy = [config.depth / baseDepth, config.vertical / baseVertical];
  const targetX = [
    imageRect.x * sx[0],
    config.depth,
    config.depth + (sourceX[2] - baseDepth) * sx[1],
  ];
  const targetY = [
    imageRect.y * sy[0],
    config.depth,
    config.depth + (sourceY[2] - baseDepth) * sy[1],
  ];
  const isRight = config.corner.endsWith("right");
  const isBottom = config.corner.startsWith("bottom");
  const anchorX = tableRect.x + (isRight ? tableRect.w : 0);
  const anchorY = tableRect.y + (isBottom ? tableRect.h : 0);
  const offset = config.depth + RECT_CORNER_GAP;

  return (
    <g
      data-floor-plan-corner={config.corner}
      data-bench-depth={config.depth}
      data-horizontal-span={config.horizontal}
      data-vertical-span={config.vertical}
      transform={`translate(${anchorX} ${anchorY}) scale(${isRight ? -scale : scale} ${isBottom ? -scale : scale}) translate(${-offset} ${-offset})`}
    >
      {[0, 1].flatMap((row) =>
        [0, 1].map((column) => (
          <svg
            key={`${row}-${column}`}
            data-bench-section={`${row}-${column}`}
            x={targetX[column]}
            y={targetY[row]}
            width={targetX[column + 1] - targetX[column]}
            height={targetY[row + 1] - targetY[row]}
            viewBox={`${sourceX[column]} ${sourceY[row]} ${sourceX[column + 1] - sourceX[column]} ${sourceY[row + 1] - sourceY[row]}`}
            preserveAspectRatio="none"
            overflow="hidden"
          >
            <image
              data-floor-plan-asset="corner-bench"
              href={asset.src}
              {...imageRect}
              preserveAspectRatio="none"
              style={{ pointerEvents: "none" }}
            />
          </svg>
        )),
      )}
    </g>
  );
}

function DynamicRoundTable({
  resolved,
  scale,
  tableRect,
  visualVariant,
  finish,
}: {
  resolved: FloorPlanResolvedDimensions;
  scale: number;
  tableRect: TableRect;
  visualVariant?: FloorPlanVisualVariant;
  finish?: FloorPlanTableFinish;
}) {
  const cx = tableRect.x + tableRect.w / 2;
  const cy = tableRect.y + tableRect.h / 2;
  const radius = tableRect.w / 2;
  const assetId =
    visualVariant === "high-table"
      ? "high-table-top"
      : resolved.capacity <= 2
        ? "round-table-duo"
        : "round-table-top";
  return (
    <>
      {resolved.seatPlacements.map((placement) => {
        const zone = placement.zone as FloorPlanRoundSeatZone;
        const orbit =
          radius + getSeatOffset(placement.type, placement.benchDepth, scale);
        if (placement.type === "bench") {
          const [pos] = createRoundZonePositions(zone, 1, cx, cy, orbit);
          const width = (placement.benchLength || 60) * scale;
          const height = (placement.benchDepth || 26) * scale;
          return (
            <FloorPlanAssetSprite
              key={`${zone}-bench`}
              assetId="banquette-straight"
              x={pos.x - width / 2}
              y={pos.y - height / 2}
              width={width}
              height={height}
              rotation={pos.angleDeg}
              fit="stretch"
            />
          );
        }
        return createRoundZonePositions(
          zone,
          placement.count,
          cx,
          cy,
          orbit,
        ).map((pos, index) => (
          <Seat
            key={`${zone}-${placement.type}-${index}`}
            pos={pos}
            type={placement.type === "stool" ? "stool" : "chair"}
            scale={scale}
          />
        ));
      })}
      <FloorPlanAssetSprite
        assetId={assetId}
        x={tableRect.x}
        y={tableRect.y}
        width={tableRect.w}
        height={tableRect.h}
        finish={finish}
      />
    </>
  );
}

function DynamicRectTable({
  resolved,
  scale,
  tableRect,
  finish,
}: {
  resolved: FloorPlanResolvedDimensions;
  scale: number;
  tableRect: TableRect;
  finish?: FloorPlanTableFinish;
}) {
  const ratio = tableRect.w / tableRect.h;
  const square = ratio >= 0.75 && ratio <= 1.33;
  const portrait = !square && tableRect.h > tableRect.w;
  const width = portrait ? tableRect.h : tableRect.w;
  const height = portrait ? tableRect.w : tableRect.h;
  return (
    <>
      {resolved.seatPlacements.map((placement) => {
        const side = placement.zone as FloorPlanRectSeatZone;
        const { start, end } = getRectCornerInset(
          side,
          resolved.cornerBenchConfigs,
          scale,
        );
        if (placement.type === "bench") {
          return (
            <RectBenchStrip
              key={`${side}-bench`}
              side={side}
              rect={tableRect}
              start={start}
              end={end}
              length={(placement.benchLength || 60) * scale}
              depth={(placement.benchDepth || 26) * scale}
            />
          );
        }
        return createRectSidePositions(
          placement.count,
          side,
          tableRect,
          getSeatOffset(placement.type, undefined, scale),
          start,
          end,
        ).map((pos, index) => (
          <Seat
            key={`${side}-${placement.type}-${index}`}
            pos={pos}
            type={placement.type === "stool" ? "stool" : "chair"}
            scale={scale}
          />
        ));
      })}
      {resolved.cornerBenchConfigs.map((config) => (
        <CornerBenchShape
          key={config.corner}
          config={config}
          tableRect={tableRect}
          scale={scale}
        />
      ))}
      <FloorPlanAssetSprite
        assetId={square ? "square-table-top" : "rect-table-top"}
        x={tableRect.x + (tableRect.w - width) / 2}
        y={tableRect.y + (tableRect.h - height) / 2}
        width={width}
        height={height}
        fit="stretch"
        rotation={portrait ? 90 : undefined}
        finish={finish}
      />
    </>
  );
}

export default function DynamicTableSvg(props: DynamicTableSvgProps) {
  const resolved = getDynamicTableDimensions(props);
  const { scale, tableRect } = getScaledFrame(
    resolved,
    props.viewportWidth ?? 200,
    props.viewportHeight ?? 140,
    props.viewportWidth == null ? 6 : 0,
  );
  return props.shape === "round" ? (
    <DynamicRoundTable
      resolved={resolved}
      scale={scale}
      tableRect={tableRect}
      visualVariant={props.visualVariant}
      finish={props.finish}
    />
  ) : (
    <DynamicRectTable
      resolved={resolved}
      scale={scale}
      tableRect={tableRect}
      finish={props.finish}
    />
  );
}
