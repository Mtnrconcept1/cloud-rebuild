import type { FloorPlanSeatType, FloorPlanTableShape } from "@/lib/floorPlan";
import {
  computeRectSeatPositions,
  computeRoundSeatPositions,
  distributeSidesRect,
  type SeatPosition,
} from "./seatPositioning";

// Warm architectural palette matching the reference image
const stroke = "#7a5a3a";
const tableFill = "#c4a67a";
const tableStroke = "#8b6d47";
const seatFill = "#faf3e8";
const seatStroke = "#7a5a3a";
const benchFill = "#d4956a";
const benchStroke = "#8b5e3c";

type DynamicTableSvgProps = {
  shape: FloorPlanTableShape;
  capacity: number;
  seatType?: FloorPlanSeatType;
};

// ─── Top-down chair: half-circle (arch) facing away from table ───

function ChairRound({ pos, r }: { pos: SeatPosition; r: number }) {
  // Draw a half-circle (the open side faces the table)
  const a = ((pos.angleDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  // Arc from left to right of the half circle
  const x1 = pos.x + r * (-sin);
  const y1 = pos.y + r * cos;
  const x2 = pos.x + r * sin;
  const y2 = pos.y + r * (-cos);

  return (
    <path
      d={`M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`}
      fill={seatFill}
      stroke={seatStroke}
      strokeWidth="2"
    />
  );
}

// ─── Top-down stool: small filled circle ───

function StoolRound({ pos, r }: { pos: SeatPosition; r: number }) {
  return (
    <circle
      cx={pos.x}
      cy={pos.y}
      r={r * 0.7}
      fill={seatFill}
      stroke={seatStroke}
      strokeWidth="2"
    />
  );
}

// ─── Top-down bench: rounded rectangle flush against the table edge ───

function BenchRect({ pos, w, h }: { pos: SeatPosition; w: number; h: number }) {
  const isVert = pos.side === "left" || pos.side === "right";
  const bw = isVert ? h * 0.45 : w;
  const bh = isVert ? w : h * 0.45;
  return (
    <rect
      x={pos.x - bw / 2}
      y={pos.y - bh / 2}
      width={bw}
      height={bh}
      rx={Math.min(bw, bh) * 0.25}
      fill={benchFill}
      stroke={benchStroke}
      strokeWidth="2"
    />
  );
}

function BenchRoundArc({ pos, r, arcSpan }: { pos: SeatPosition; r: number; arcSpan: number }) {
  const halfArc = (arcSpan / 2) * (Math.PI / 180);
  const centerAngle = ((pos.angleDeg - 90) * Math.PI) / 180;

  const outerR = r;
  const innerR = r * 0.55;

  const a1 = centerAngle - halfArc;
  const a2 = centerAngle + halfArc;

  const ox1 = pos.x + outerR * Math.cos(a1);
  const oy1 = pos.y + outerR * Math.sin(a1);
  const ox2 = pos.x + outerR * Math.cos(a2);
  const oy2 = pos.y + outerR * Math.sin(a2);
  const ix1 = pos.x + innerR * Math.cos(a2);
  const iy1 = pos.y + innerR * Math.sin(a2);
  const ix2 = pos.x + innerR * Math.cos(a1);
  const iy2 = pos.y + innerR * Math.sin(a1);

  const largeArc = arcSpan > 180 ? 1 : 0;

  return (
    <path
      d={`M${ox1},${oy1} A${outerR},${outerR} 0 ${largeArc},1 ${ox2},${oy2} L${ix1},${iy1} A${innerR},${innerR} 0 ${largeArc},0 ${ix2},${iy2} Z`}
      fill={benchFill}
      stroke={benchStroke}
      strokeWidth="1.5"
    />
  );
}

// ─── Top-down corner bench: L-shape hugging the corner of the table ───

function CornerBenchRect({
  corner,
  tableRect,
  thickness,
  armLength,
}: {
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  tableRect: { x: number; y: number; w: number; h: number };
  thickness: number;
  armLength: number;
}) {
  const { x, y, w, h } = tableRect;
  const t = thickness;
  const a = armLength;
  let d: string;

  switch (corner) {
    case "top-left":
      d = `M${x - t},${y - t} L${x + a},${y - t} L${x + a},${y} L${x},${y} L${x},${y + a} L${x - t},${y + a} Z`;
      break;
    case "top-right":
      d = `M${x + w - a},${y - t} L${x + w + t},${y - t} L${x + w + t},${y + a} L${x + w},${y + a} L${x + w},${y} L${x + w - a},${y} Z`;
      break;
    case "bottom-right":
      d = `M${x + w},${y + h - a} L${x + w + t},${y + h - a} L${x + w + t},${y + h + t} L${x + w - a},${y + h + t} L${x + w - a},${y + h} L${x + w},${y + h} Z`;
      break;
    case "bottom-left":
      d = `M${x - t},${y + h - a} L${x},${y + h - a} L${x},${y + h} L${x + a},${y + h} L${x + a},${y + h + t} L${x - t},${y + h + t} Z`;
      break;
  }

  return (
    <path
      d={d}
      fill={benchFill}
      stroke={benchStroke}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  );
}

// ─── Seat dispatcher ───

function Seat({
  pos,
  seatType,
  seatSize,
}: {
  pos: SeatPosition;
  seatType: FloorPlanSeatType;
  seatSize: number;
}) {
  switch (seatType) {
    case "stool":
      return <StoolRound pos={pos} r={seatSize} />;
    case "bench":
      return pos.side
        ? <BenchRect pos={pos} w={seatSize * 2.2} h={seatSize * 2} />
        : <BenchRoundArc pos={pos} r={seatSize} arcSpan={45} />;
    case "chair":
    default:
      return <ChairRound pos={pos} r={seatSize} />;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ROUND TABLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DynamicRoundTable({ capacity, seatType }: { capacity: number; seatType: FloorPlanSeatType }) {
  const cx = 100;
  const cy = 70;
  const tableRadius = Math.max(22, Math.min(38, 20 + capacity * 1.5));
  const seatSize = Math.max(7, Math.min(14, 56 / capacity));
  const gap = 3;
  const orbitRadius = tableRadius + seatSize + gap;

  const positions = computeRoundSeatPositions(capacity, cx, cy, orbitRadius);

  return (
    <>
      {/* Seats first (behind table visually at the edges) */}
      {seatType === "bench" ? (
        positions.map((pos, i) => (
          <BenchRoundArc
            key={i}
            pos={{ ...pos, x: cx, y: cy }}
            r={orbitRadius}
            arcSpan={Math.max(18, (320 / capacity))}
          />
        ))
      ) : (
        positions.map((pos, i) => (
          <Seat key={i} pos={pos} seatType={seatType} seatSize={seatSize} />
        ))
      )}
      {/* Table surface */}
      <circle cx={cx} cy={cy} r={tableRadius} fill={tableFill} stroke={tableStroke} strokeWidth="3" />
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RECTANGULAR TABLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DynamicRectTable({ capacity, seatType }: { capacity: number; seatType: FloorPlanSeatType }) {
  const dist = distributeSidesRect(capacity);
  const maxLong = Math.max(dist.top, dist.bottom);
  const maxShort = Math.max(dist.left, dist.right);

  const seatSize = Math.max(7, Math.min(13, 50 / capacity));
  const seatSpan = seatSize * 2.4;
  const gap = 3;

  // Table dimensions scale to fit seats
  const tw = Math.max(50, maxLong * seatSpan + 16);
  const th = Math.max(36, maxShort * seatSpan + 12);
  const tx = 100 - tw / 2;
  const ty = 70 - th / 2;
  const tableRect = { x: tx, y: ty, w: tw, h: th };
  const rx = Math.min(8, tw * 0.1, th * 0.1);

  const seatOffset = seatSize + gap;

  if (seatType === "corner-bench") {
    // Corner benches wrap the table corners as L-shapes
    const corners: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right"> = [];
    const count = Math.max(1, Math.min(4, capacity));
    const order: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right"> = [
      "top-left", "top-right", "bottom-right", "bottom-left",
    ];
    for (let i = 0; i < count && i < 4; i++) corners.push(order[i]);

    const benchThickness = seatSize * 1.1;
    const armLength = Math.min(tw * 0.55, th * 0.55, seatSize * 3.5);

    return (
      <>
        {corners.map((c) => (
          <CornerBenchRect
            key={c}
            corner={c}
            tableRect={tableRect}
            thickness={benchThickness}
            armLength={armLength}
          />
        ))}
        <rect x={tx} y={ty} width={tw} height={th} rx={rx} fill={tableFill} stroke={tableStroke} strokeWidth="3" />
      </>
    );
  }

  const positions = computeRectSeatPositions(capacity, tableRect, seatOffset);

  return (
    <>
      {positions.map((pos, i) => (
        <Seat key={i} pos={pos} seatType={seatType} seatSize={seatSize} />
      ))}
      <rect x={tx} y={ty} width={tw} height={th} rx={rx} fill={tableFill} stroke={tableStroke} strokeWidth="3" />
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DynamicTableSvg({ shape, capacity, seatType = "chair" }: DynamicTableSvgProps) {
  const safeCapacity = Math.max(1, Math.min(16, Math.round(capacity || 1)));

  // Corner bench on round doesn't make sense — fall back to bench
  const effectiveSeatType = shape === "round" && seatType === "corner-bench" ? "bench" : seatType;

  return shape === "round"
    ? <DynamicRoundTable capacity={safeCapacity} seatType={effectiveSeatType} />
    : <DynamicRectTable capacity={safeCapacity} seatType={effectiveSeatType} />;
}
