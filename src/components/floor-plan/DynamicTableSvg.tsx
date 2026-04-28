import {
  type FloorPlanCornerBenchConfig,
  type FloorPlanCornerBenchCorner,
  type FloorPlanRectSeatZone,
  type FloorPlanResolvedDimensions,
  type FloorPlanRoundSeatZone,
  type FloorPlanSeatPlacement,
  type FloorPlanSeatType,
  type FloorPlanTableShape,
  getResolvedFloorPlanDimensions,
} from "@/lib/floorPlan";
import { type SeatPosition } from "./seatPositioning";
import { FLOOR_PLAN_ASSETS } from "./floorPlanAssets";

const VIEWBOX_WIDTH = 200;
const VIEWBOX_HEIGHT = 140;
const VIEWBOX_PADDING = 6;
const RECT_CORNER_GAP = 10;
const CORNER_BENCH_BASE_HORIZONTAL = 92;
const CORNER_BENCH_BASE_VERTICAL = 86;
const CORNER_BENCH_SEAT_SPAN = 52;
const CORNER_BENCH_ASPECT_RATIO = 162 / 135;
const STRAIGHT_BENCH_ASPECT_RATIO = 71 / 112;
const CORNER_BENCH_INNER_X_RATIO = 55 / 162;
const CORNER_BENCH_INNER_Y_RATIO = 115 / 135;

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

type DynamicTableSvgProps = {
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
};

function SvgAsset({
  assetId,
  x,
  y,
  width,
  height,
  rotation,
  rotationCenterX,
  rotationCenterY,
  preserveAspectRatio = "none",
  opacity = 1,
}: {
  assetId: keyof typeof FLOOR_PLAN_ASSETS;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  rotationCenterX?: number;
  rotationCenterY?: number;
  preserveAspectRatio?: string;
  opacity?: number;
}) {
  const asset = FLOOR_PLAN_ASSETS[assetId];
  const centerX = rotationCenterX ?? (x + width / 2);
  const centerY = rotationCenterY ?? (y + height / 2);

  return (
    <image
      href={asset.src}
      x={x}
      y={y}
      width={width}
      height={height}
      opacity={opacity}
      preserveAspectRatio={preserveAspectRatio}
      transform={rotation == null ? undefined : `rotate(${rotation} ${centerX} ${centerY})`}
    />
  );
}

function ChairRound({ pos, r }: { pos: SeatPosition; r: number }) {
  const width = r * 2.6;
  const height = r * 3.1;

  return (
    <SvgAsset
      assetId="chair"
      x={pos.x - width / 2}
      y={pos.y - height / 2}
      width={width}
      height={height}
      rotation={pos.angleDeg}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function StoolRound({ pos, r }: { pos: SeatPosition; r: number }) {
  const size = r * 2.45;

  return (
    <SvgAsset
      assetId="stool"
      x={pos.x - size / 2}
      y={pos.y - size / 2}
      width={size}
      height={size}
      rotation={pos.angleDeg}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function BenchRoundArc({
  pos,
  r,
  arcSpan,
  depth,
}: {
  pos: SeatPosition;
  r: number;
  arcSpan: number;
  depth: number;
}) {
  const centerAngle = ((pos.angleDeg - 90) * Math.PI) / 180;
  const arcWidth = Math.max(depth * 2.1, r * arcSpan * (Math.PI / 180));
  const centerRadius = Math.max(0, r - depth * 0.42);
  const centerX = pos.x + centerRadius * Math.cos(centerAngle);
  const centerY = pos.y + centerRadius * Math.sin(centerAngle);

  return (
    <SvgAsset
      assetId="banquette-straight"
      x={centerX - arcWidth / 2}
      y={centerY - depth / 2}
      width={arcWidth}
      height={depth}
      rotation={pos.angleDeg}
    />
  );
}

function CornerBenchShape({
  config,
  tableRect,
  scale,
}: {
  config: FloorPlanCornerBenchConfig;
  tableRect: { x: number; y: number; w: number; h: number };
  scale: number;
}) {
  const { x, y, w, h } = tableRect;
  const { corner, depth } = config;
  const horizontalSeats = Math.max(1, Math.round(config.horizontalSeats || 1));
  const verticalSeats = Math.max(1, Math.round(config.verticalSeats || 1));
  const baseVertical = CORNER_BENCH_BASE_VERTICAL * scale;
  const cornerHeight = baseVertical + depth;
  const cornerWidth = cornerHeight * CORNER_BENCH_ASPECT_RATIO;
  const moduleHeight = cornerHeight;
  const moduleWidth = Math.max(CORNER_BENCH_SEAT_SPAN * scale, moduleHeight * STRAIGHT_BENCH_ASPECT_RATIO);
  const innerX = cornerWidth * CORNER_BENCH_INNER_X_RATIO;
  const innerY = cornerHeight * CORNER_BENCH_INNER_Y_RATIO;
  const extraHorizontalSeats = Math.max(0, horizontalSeats - 1);
  const extraVerticalSeats = Math.max(0, verticalSeats - 1);
  const placementByCorner: Record<FloorPlanCornerBenchCorner, { x: number; y: number; scaleX: number; scaleY: number }> = {
    "top-left": {
      x,
      y,
      scaleX: -1,
      scaleY: 1,
    },
    "top-right": {
      x: x + w,
      y,
      scaleX: 1,
      scaleY: 1,
    },
    "bottom-right": {
      x: x + w,
      y: y + h,
      scaleX: 1,
      scaleY: -1,
    },
    "bottom-left": {
      x,
      y: y + h,
      scaleX: -1,
      scaleY: -1,
    },
  };
  const placement = placementByCorner[corner];
  const horizontalModules = Array.from({ length: extraHorizontalSeats }, (_, index) => {
    return { x: -(index + 1) * moduleWidth, y: 0, width: moduleWidth, height: moduleHeight };
  });
  const verticalModules = Array.from({ length: extraVerticalSeats }, (_, index) => {
    return {
      x: cornerWidth - moduleHeight,
      y: cornerHeight + index * moduleWidth,
      width: moduleWidth,
      height: moduleHeight,
    };
  });
  const groupTransform = [
    `translate(${placement.x} ${placement.y})`,
    `scale(${placement.scaleX} ${placement.scaleY})`,
    `translate(${-innerX} ${-innerY})`,
  ].join(" ");

  return (
    <g transform={groupTransform}>
      <SvgAsset
        assetId="corner-bench"
        x={0}
        y={0}
        width={cornerWidth}
        height={cornerHeight}
      />
      {horizontalModules.map((module, index) => (
        <SvgAsset
          key={`${corner}-horizontal-${index}`}
          assetId="banquette-straight"
          x={module.x}
          y={module.y}
          width={module.width}
          height={module.height}
        />
      ))}
      {verticalModules.map((module, index) => (
        <g
          key={`${corner}-vertical-${index}`}
          transform={`translate(${module.x + module.height} ${module.y}) rotate(90)`}
        >
          <SvgAsset
            assetId="banquette-straight"
            x={0}
            y={0}
            width={module.width}
            height={module.height}
          />
        </g>
      ))}
    </g>
  );
}

function RectBenchStrip({
  side,
  tableRect,
  offset,
  startInset,
  endInset,
  length,
  depth,
}: {
  side: FloorPlanRectSeatZone;
  tableRect: { x: number; y: number; w: number; h: number };
  offset: number;
  startInset: number;
  endInset: number;
  length: number;
  depth: number;
}) {
  if (side === "top" || side === "bottom") {
    const available = Math.max(24, tableRect.w - startInset - endInset);
    const width = Math.min(length, available);
    const height = depth;
    const x = tableRect.x + startInset + (available - width) / 2;
    const y = side === "top"
      ? tableRect.y - offset - height / 2
      : tableRect.y + tableRect.h + offset - height / 2;

    return (
      <SvgAsset
        assetId="banquette-straight"
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={side === "top" ? 0 : 180}
      />
    );
  }

  const available = Math.max(24, tableRect.h - startInset - endInset);
  const width = depth;
  const height = Math.min(length, available);
  const x = side === "left"
    ? tableRect.x - offset - width / 2
    : tableRect.x + tableRect.w + offset - width / 2;
  const y = tableRect.y + startInset + (available - height) / 2;

  return (
    <SvgAsset
      assetId="banquette-straight"
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={side === "left" ? 270 : 90}
    />
  );
}

function Seat({
  pos,
  seatType,
  seatSize,
}: {
  pos: SeatPosition;
  seatType: "chair" | "stool";
  seatSize: number;
}) {
  return seatType === "stool"
    ? <StoolRound pos={pos} r={seatSize} />
    : <ChairRound pos={pos} r={seatSize} />;
}

function getScaledFrame(resolved: FloorPlanResolvedDimensions) {
  const availableWidth = VIEWBOX_WIDTH - VIEWBOX_PADDING * 2;
  const availableHeight = VIEWBOX_HEIGHT - VIEWBOX_PADDING * 2;
  const scale = Math.min(
    availableWidth / resolved.footprintWidth,
    availableHeight / resolved.footprintHeight,
  );
  const renderWidth = resolved.footprintWidth * scale;
  const renderHeight = resolved.footprintHeight * scale;
  const originX = (VIEWBOX_WIDTH - renderWidth) / 2;
  const originY = (VIEWBOX_HEIGHT - renderHeight) / 2;

  return {
    scale,
    originX,
    originY,
    tableRect: {
      x: originX + resolved.paddingLeft * scale,
      y: originY + resolved.paddingTop * scale,
      w: resolved.tableWidth * scale,
      h: resolved.tableHeight * scale,
    },
  };
}

function getRectCornerInset(
  side: FloorPlanRectSeatZone,
  cornerBenchConfigs: FloorPlanCornerBenchConfig[],
) {
  const findCorner = (corner: FloorPlanCornerBenchCorner) => cornerBenchConfigs.find((config) => config.corner === corner);

  if (side === "top") {
    return {
      start: (findCorner("top-left")?.horizontal || 0) + RECT_CORNER_GAP,
      end: (findCorner("top-right")?.horizontal || 0) + RECT_CORNER_GAP,
    };
  }
  if (side === "bottom") {
    return {
      start: (findCorner("bottom-left")?.horizontal || 0) + RECT_CORNER_GAP,
      end: (findCorner("bottom-right")?.horizontal || 0) + RECT_CORNER_GAP,
    };
  }
  if (side === "left") {
    return {
      start: (findCorner("top-left")?.vertical || 0) + RECT_CORNER_GAP,
      end: (findCorner("bottom-left")?.vertical || 0) + RECT_CORNER_GAP,
    };
  }
  return {
    start: (findCorner("top-right")?.vertical || 0) + RECT_CORNER_GAP,
    end: (findCorner("bottom-right")?.vertical || 0) + RECT_CORNER_GAP,
  };
}

function createRectSidePositions(
  count: number,
  side: FloorPlanRectSeatZone,
  tableRect: { x: number; y: number; w: number; h: number },
  offset: number,
  startInset: number,
  endInset: number,
) {
  const positions: SeatPosition[] = [];
  if (count <= 0) return positions;

  const isHorizontal = side === "top" || side === "bottom";
  const totalSpan = isHorizontal ? tableRect.w : tableRect.h;
  const availableSpan = Math.max(16, totalSpan - startInset - endInset);
  const step = availableSpan / (count + 1);

  for (let index = 0; index < count; index += 1) {
    const t = startInset + step * (index + 1);

    if (side === "top") {
      positions.push({ x: tableRect.x + t, y: tableRect.y - offset, angleDeg: 0, side });
      continue;
    }
    if (side === "bottom") {
      positions.push({ x: tableRect.x + t, y: tableRect.y + tableRect.h + offset, angleDeg: 180, side });
      continue;
    }
    if (side === "left") {
      positions.push({ x: tableRect.x - offset, y: tableRect.y + t, angleDeg: 270, side });
      continue;
    }

    positions.push({ x: tableRect.x + tableRect.w + offset, y: tableRect.y + t, angleDeg: 90, side });
  }

  return positions;
}

function createRoundZonePositions(
  zone: FloorPlanRoundSeatZone,
  count: number,
  cx: number,
  cy: number,
  orbitRadius: number,
) {
  if (count <= 0) return [] as SeatPosition[];

  const centerPolarDeg = ROUND_ZONE_POLAR_ANGLES[zone];
  const spread = count === 1 ? 0 : Math.min(44, Math.max(18, 12 + count * 7));
  const startDeg = centerPolarDeg - spread / 2;
  const step = count <= 1 ? 0 : spread / (count - 1);

  return Array.from({ length: count }, (_, index) => {
    const polarDeg = startDeg + step * index;
    const polarRad = (polarDeg * Math.PI) / 180;
    return {
      x: cx + orbitRadius * Math.cos(polarRad),
      y: cy + orbitRadius * Math.sin(polarRad),
      angleDeg: polarDeg + 90,
    };
  });
}

function DynamicRoundTable({ resolved }: { resolved: FloorPlanResolvedDimensions }) {
  const { scale, originX, originY } = getScaledFrame(resolved);
  const cx = originX + (resolved.footprintWidth * scale) / 2;
  const cy = originY + (resolved.footprintHeight * scale) / 2;
  const tableRadius = (resolved.tableWidth * scale) / 2;
  const orbitRadius = tableRadius + resolved.paddingTop * scale * 0.54;
  const seatSize = Math.max(8.5, Math.min(16, resolved.paddingTop * scale * 0.4));

  return (
    <>
      {resolved.seatPlacements.map((placement) => {
        const zone = placement.zone as FloorPlanRoundSeatZone;
        if (placement.type === "bench") {
          const circumference = 2 * Math.PI * orbitRadius;
          const arcSpan = Math.min(42, ((placement.benchLength || 52) / circumference) * 360);
          const depth = Math.max(10, (placement.benchDepth || 22) * scale * 0.62);
          return (
            <BenchRoundArc
              key={`${zone}-bench`}
              pos={{ x: cx, y: cy, angleDeg: ROUND_ZONE_POLAR_ANGLES[zone] + 90 }}
              r={orbitRadius}
              arcSpan={arcSpan}
              depth={depth}
            />
          );
        }

        return createRoundZonePositions(zone, placement.count, cx, cy, orbitRadius).map((position, index) => (
          <Seat
            key={`${zone}-${placement.type}-${index}`}
            pos={position}
            seatType={placement.type === "stool" ? "stool" : "chair"}
            seatSize={seatSize}
          />
        ));
      })}

      <SvgAsset
        assetId="round-table-top"
        x={cx - tableRadius}
        y={cy - tableRadius}
        width={tableRadius * 2}
        height={tableRadius * 2}
        preserveAspectRatio="xMidYMid meet"
      />
    </>
  );
}

function DynamicRectTable({ resolved }: { resolved: FloorPlanResolvedDimensions }) {
  const { scale, tableRect } = getScaledFrame(resolved);
  const seatSize = Math.max(8, Math.min(14, Math.min(tableRect.w, tableRect.h) * 0.12));

  return (
    <>
      {resolved.seatPlacements.map((placement) => {
        const side = placement.zone as FloorPlanRectSeatZone;
        const insets = getRectCornerInset(side, resolved.cornerBenchConfigs.map((config) => ({
          ...config,
          horizontal: config.horizontal * scale,
          vertical: config.vertical * scale,
          depth: config.depth * scale,
        })));
        const offsetBySide: Record<FloorPlanRectSeatZone, number> = {
          top: resolved.paddingTop * scale * 0.54,
          right: resolved.paddingRight * scale * 0.54,
          bottom: resolved.paddingBottom * scale * 0.54,
          left: resolved.paddingLeft * scale * 0.54,
        };

        if (placement.type === "bench") {
          return (
            <RectBenchStrip
              key={`${side}-bench`}
              side={side}
              tableRect={tableRect}
              offset={offsetBySide[side]}
              startInset={insets.start}
              endInset={insets.end}
              length={(placement.benchLength || 60) * scale}
              depth={(placement.benchDepth || 22) * scale}
            />
          );
        }

        return createRectSidePositions(
          placement.count,
          side,
          tableRect,
          offsetBySide[side],
          insets.start,
          insets.end,
        ).map((position, index) => (
          <Seat
            key={`${side}-${placement.type}-${index}`}
            pos={position}
            seatType={placement.type === "stool" ? "stool" : "chair"}
            seatSize={seatSize}
          />
        ));
      })}

      <SvgAsset
        assetId="rect-table-top"
        x={tableRect.x}
        y={tableRect.y}
        width={tableRect.w}
        height={tableRect.h}
      />

      {resolved.cornerBenchConfigs.map((config) => (
        <CornerBenchShape
          key={config.corner}
          config={{
            ...config,
            horizontal: config.horizontal * scale,
            vertical: config.vertical * scale,
            depth: config.depth * scale,
          }}
          tableRect={tableRect}
          scale={scale}
        />
      ))}
    </>
  );
}

export default function DynamicTableSvg({
  shape,
  capacity,
  seatType = "chair",
  seatPlacements,
  cornerBenchCorners,
  cornerBenchConfigs,
  tableWidth,
  tableHeight,
  cornerBenchHorizontal,
  cornerBenchVertical,
  cornerBenchDepth,
}: DynamicTableSvgProps) {
  const resolved = getResolvedFloorPlanDimensions({
    capacity: Math.max(1, Math.min(32, Math.round(capacity || 1))),
    shape,
    seatType,
    seatPlacements,
    cornerBenchCorners,
    cornerBenchConfigs,
    tableWidth,
    tableHeight,
    cornerBenchHorizontal,
    cornerBenchVertical,
    cornerBenchDepth,
  });

  return (
    <>
      {shape === "round"
        ? <DynamicRoundTable resolved={resolved} />
        : <DynamicRectTable resolved={resolved} />}
    </>
  );
}
