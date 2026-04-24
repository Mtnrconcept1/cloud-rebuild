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

const tableStroke = "#7d6545";
const seatStroke = "#73563a";
const benchStroke = "#8a603f";
const shadowFill = "rgba(15,23,42,0.12)";

const VIEWBOX_WIDTH = 200;
const VIEWBOX_HEIGHT = 140;
const VIEWBOX_PADDING = 6;
const RECT_CORNER_GAP = 10;

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

function TableSvgDefs() {
  return (
    <defs>
      <linearGradient id="fp-table-surface" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#dfc093" />
        <stop offset="52%" stopColor="#c6a477" />
        <stop offset="100%" stopColor="#b48b5c" />
      </linearGradient>
      <linearGradient id="fp-table-inset" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f2ddbc" />
        <stop offset="100%" stopColor="#d9b585" />
      </linearGradient>
      <linearGradient id="fp-seat-surface" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff8f0" />
        <stop offset="100%" stopColor="#efd7b8" />
      </linearGradient>
      <linearGradient id="fp-bench-surface" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d5a77d" />
        <stop offset="100%" stopColor="#b97e53" />
      </linearGradient>
      <linearGradient id="fp-bench-inset" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f5e6d4" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#f5e6d4" stopOpacity="0.18" />
      </linearGradient>
    </defs>
  );
}

function ChairRound({ pos, r }: { pos: SeatPosition; r: number }) {
  const a = ((pos.angleDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x1 = pos.x + r * (-sin);
  const y1 = pos.y + r * cos;
  const x2 = pos.x + r * sin;
  const y2 = pos.y + r * (-cos);

  return (
    <>
      <ellipse cx={pos.x} cy={pos.y + 1.3} rx={r * 0.92} ry={r * 0.56} fill={shadowFill} />
      <path
        d={`M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`}
        fill="url(#fp-seat-surface)"
        stroke={seatStroke}
        strokeWidth="2.2"
      />
      <path
        d={`M${pos.x + r * 0.72 * (-sin)},${pos.y + r * 0.72 * cos} A${r * 0.72},${r * 0.72} 0 0,1 ${pos.x + r * 0.72 * sin},${pos.y + r * 0.72 * (-cos)}`}
        fill="none"
        opacity="0.55"
        stroke="#f6e7d1"
        strokeWidth="1.25"
      />
    </>
  );
}

function StoolRound({ pos, r }: { pos: SeatPosition; r: number }) {
  return (
    <>
      <ellipse cx={pos.x} cy={pos.y + 1.2} rx={r * 0.78} ry={r * 0.48} fill={shadowFill} />
      <circle cx={pos.x} cy={pos.y} r={r * 0.78} fill="url(#fp-seat-surface)" stroke={seatStroke} strokeWidth="2.2" />
      <circle cx={pos.x} cy={pos.y} r={r * 0.38} fill="none" stroke="#eed8b7" strokeWidth="1.35" opacity="0.9" />
    </>
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
  const halfArc = (arcSpan / 2) * (Math.PI / 180);
  const centerAngle = ((pos.angleDeg - 90) * Math.PI) / 180;
  const outerRadius = r;
  const innerRadius = Math.max(outerRadius - depth, outerRadius * 0.55);

  const a1 = centerAngle - halfArc;
  const a2 = centerAngle + halfArc;
  const ox1 = pos.x + outerRadius * Math.cos(a1);
  const oy1 = pos.y + outerRadius * Math.sin(a1);
  const ox2 = pos.x + outerRadius * Math.cos(a2);
  const oy2 = pos.y + outerRadius * Math.sin(a2);
  const ix1 = pos.x + innerRadius * Math.cos(a2);
  const iy1 = pos.y + innerRadius * Math.sin(a2);
  const ix2 = pos.x + innerRadius * Math.cos(a1);
  const iy2 = pos.y + innerRadius * Math.sin(a1);
  const accentRadius = Math.max(innerRadius + depth * 0.4, innerRadius);

  return (
    <>
      <path
        d={`M${ox1},${oy1} A${outerRadius},${outerRadius} 0 0,1 ${ox2},${oy2} L${ix1},${iy1} A${innerRadius},${innerRadius} 0 0,0 ${ix2},${iy2} Z`}
        fill="url(#fp-bench-surface)"
        stroke={benchStroke}
        strokeWidth="1.7"
      />
      <path
        d={`M${pos.x + accentRadius * Math.cos(a1)},${pos.y + accentRadius * Math.sin(a1)} A${accentRadius},${accentRadius} 0 0,1 ${pos.x + accentRadius * Math.cos(a2)},${pos.y + accentRadius * Math.sin(a2)}`}
        fill="none"
        opacity="0.42"
        stroke="url(#fp-bench-inset)"
        strokeWidth="2"
      />
    </>
  );
}

function CornerBenchShape({
  config,
  tableRect,
}: {
  config: FloorPlanCornerBenchConfig;
  tableRect: { x: number; y: number; w: number; h: number };
}) {
  const { x, y, w, h } = tableRect;
  const { corner, horizontal, vertical, depth } = config;
  const pathByCorner: Record<FloorPlanCornerBenchCorner, string> = {
    "top-left": [
      `M${x - depth},${y - depth}`,
      `L${x + horizontal},${y - depth}`,
      `L${x + horizontal},${y}`,
      `L${x},${y}`,
      `L${x},${y + vertical}`,
      `L${x - depth},${y + vertical}`,
      "Z",
    ].join(" "),
    "top-right": [
      `M${x + w - horizontal},${y - depth}`,
      `L${x + w + depth},${y - depth}`,
      `L${x + w + depth},${y + vertical}`,
      `L${x + w},${y + vertical}`,
      `L${x + w},${y}`,
      `L${x + w - horizontal},${y}`,
      "Z",
    ].join(" "),
    "bottom-right": [
      `M${x + w},${y + h - vertical}`,
      `L${x + w + depth},${y + h - vertical}`,
      `L${x + w + depth},${y + h + depth}`,
      `L${x + w - horizontal},${y + h + depth}`,
      `L${x + w - horizontal},${y + h}`,
      `L${x + w},${y + h}`,
      "Z",
    ].join(" "),
    "bottom-left": [
      `M${x - depth},${y + h - vertical}`,
      `L${x},${y + h - vertical}`,
      `L${x},${y + h}`,
      `L${x + horizontal},${y + h}`,
      `L${x + horizontal},${y + h + depth}`,
      `L${x - depth},${y + h + depth}`,
      "Z",
    ].join(" "),
  };

  return (
    <>
      <path
        d={pathByCorner[corner]}
        fill="url(#fp-bench-surface)"
        stroke={benchStroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d={pathByCorner[corner]}
        fill="none"
        opacity="0.28"
        stroke="url(#fp-bench-inset)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </>
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
      <>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={height / 2}
          fill="url(#fp-bench-surface)"
          stroke={benchStroke}
          strokeWidth="2"
        />
        <rect
          x={x + 5}
          y={y + 4}
          width={Math.max(width - 10, 0)}
          height={Math.max(height - 8, 0)}
          rx={Math.max((height - 8) / 2, 2)}
          fill="none"
          opacity="0.26"
          stroke="url(#fp-bench-inset)"
          strokeWidth="2"
        />
      </>
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
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={width / 2}
        fill="url(#fp-bench-surface)"
        stroke={benchStroke}
        strokeWidth="2"
      />
      <rect
        x={x + 4}
        y={y + 5}
        width={Math.max(width - 8, 0)}
        height={Math.max(height - 10, 0)}
        rx={Math.max((width - 8) / 2, 2)}
        fill="none"
        opacity="0.26"
        stroke="url(#fp-bench-inset)"
        strokeWidth="2"
      />
    </>
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
            seatType={placement.type}
            seatSize={seatSize}
          />
        ));
      })}

      <ellipse cx={cx} cy={cy + tableRadius * 0.14} rx={tableRadius * 0.96} ry={tableRadius * 0.7} fill={shadowFill} />
      <circle cx={cx} cy={cy} r={tableRadius} fill="url(#fp-table-surface)" stroke={tableStroke} strokeWidth="3.1" />
      <circle cx={cx} cy={cy} r={tableRadius * 0.72} fill="url(#fp-table-inset)" opacity="0.9" />
      <circle cx={cx} cy={cy} r={tableRadius * 0.18} fill="#f6e4c8" opacity="0.75" stroke="#c89f6a" strokeWidth="1.25" />
    </>
  );
}

function DynamicRectTable({ resolved }: { resolved: FloorPlanResolvedDimensions }) {
  const { scale, tableRect } = getScaledFrame(resolved);
  const seatSize = Math.max(8, Math.min(14, Math.min(tableRect.w, tableRect.h) * 0.12));
  const rx = Math.min(12, tableRect.w * 0.1, tableRect.h * 0.1);

  return (
    <>
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
        />
      ))}

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
            seatType={placement.type}
            seatSize={seatSize}
          />
        ));
      })}

      <ellipse
        cx={tableRect.x + tableRect.w / 2}
        cy={tableRect.y + tableRect.h / 2 + Math.min(6, tableRect.h * 0.1)}
        rx={tableRect.w * 0.48}
        ry={tableRect.h * 0.36}
        fill={shadowFill}
      />
      <rect
        x={tableRect.x}
        y={tableRect.y}
        width={tableRect.w}
        height={tableRect.h}
        rx={rx}
        fill="url(#fp-table-surface)"
        stroke={tableStroke}
        strokeWidth="3"
      />
      <rect
        x={tableRect.x + 7}
        y={tableRect.y + 7}
        width={Math.max(tableRect.w - 14, 0)}
        height={Math.max(tableRect.h - 14, 0)}
        rx={Math.max(rx - 4, 4)}
        fill="url(#fp-table-inset)"
        opacity="0.92"
      />
      <line
        x1={tableRect.x + tableRect.w * 0.18}
        y1={tableRect.y + tableRect.h / 2}
        x2={tableRect.x + tableRect.w * 0.82}
        y2={tableRect.y + tableRect.h / 2}
        stroke="#f4dfbf"
        strokeWidth="1.4"
        opacity="0.54"
      />
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
      <TableSvgDefs />
      {shape === "round"
        ? <DynamicRoundTable resolved={resolved} />
        : <DynamicRectTable resolved={resolved} />}
    </>
  );
}
