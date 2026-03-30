import type { FloorPlanItemKind, FloorPlanSeatType, FloorPlanTableShape } from "@/lib/floorPlan";
import { cn } from "@/lib/utils";
import DynamicTableSvg from "./DynamicTableSvg";

type FloorPlanItemIllustrationProps = {
  kind: FloorPlanItemKind;
  shape?: FloorPlanTableShape;
  className?: string;
  decorative?: boolean;
  capacity?: number;
  seatType?: FloorPlanSeatType;
};

// ─── Architectural top-down palette (warm browns / tans) ───
const stroke = "#7a5a3a";
const strokeSoft = "#a07850";
const fill = "#c4a67a";
const fillLight = "#faf3e8";
const fillDeep = "#d4956a";
const accent = "#e8a44a";
const plant = "#8db580";
const plantDeep = "#5e8c52";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Top-down furniture — no perspective, no 3D, no blocks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Chair: half-circle (arch) — the iconic top-down chair shape */
function ChairSvg() {
  return (
    <>
      <path
        d="M60,95 A40,40 0 0,1 140,95 Z"
        fill={fillLight}
        stroke={stroke}
        strokeWidth="4"
      />
      <line x1="60" y1="95" x2="140" y2="95" stroke={stroke} strokeWidth="3" />
      {/* Small backrest thickness line */}
      <path
        d="M65,90 A36,36 0 0,1 135,90"
        fill="none"
        stroke={strokeSoft}
        strokeWidth="2"
      />
    </>
  );
}

/** Stool: simple circle seen from above */
function StoolSvg() {
  return (
    <>
      <circle cx="100" cy="70" r="36" fill={fillLight} stroke={stroke} strokeWidth="4" />
      <circle cx="100" cy="70" r="18" fill="none" stroke={strokeSoft} strokeWidth="2" />
    </>
  );
}

/** Round table preset: table + 4 half-circle chairs */
function RoundTableSvg() {
  const cx = 100;
  const cy = 70;
  const r = 30;
  const orbit = 50;
  const chairR = 12;

  const chairs = [0, 90, 180, 270].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const px = cx + orbit * Math.cos(a);
    const py = cy + orbit * Math.sin(a);
    const a1x = px + chairR * Math.cos(a - Math.PI / 2);
    const a1y = py + chairR * Math.sin(a - Math.PI / 2);
    const a2x = px + chairR * Math.cos(a + Math.PI / 2);
    const a2y = py + chairR * Math.sin(a + Math.PI / 2);
    return (
      <path
        key={deg}
        d={`M${a1x},${a1y} A${chairR},${chairR} 0 0,1 ${a2x},${a2y} Z`}
        fill={fillLight}
        stroke={stroke}
        strokeWidth="3"
      />
    );
  });

  return (
    <>
      {chairs}
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth="4" />
    </>
  );
}

/** Rect table preset: table + 6 half-circle chairs */
function RectTableSvg() {
  const tx = 34;
  const ty = 32;
  const tw = 132;
  const th = 76;
  const cx = tx + tw / 2;
  const chairR = 11;

  const positions = [
    // top
    { x: cx - 28, y: ty - chairR - 2, angle: -90 },
    { x: cx + 28, y: ty - chairR - 2, angle: -90 },
    // bottom
    { x: cx - 28, y: ty + th + chairR + 2, angle: 90 },
    { x: cx + 28, y: ty + th + chairR + 2, angle: 90 },
    // left
    { x: tx - chairR - 2, y: ty + th / 2, angle: 180 },
    // right
    { x: tx + tw + chairR + 2, y: ty + th / 2, angle: 0 },
  ];

  return (
    <>
      {positions.map((p, i) => {
        const a = (p.angle * Math.PI) / 180;
        const a1x = p.x + chairR * Math.cos(a - Math.PI / 2);
        const a1y = p.y + chairR * Math.sin(a - Math.PI / 2);
        const a2x = p.x + chairR * Math.cos(a + Math.PI / 2);
        const a2y = p.y + chairR * Math.sin(a + Math.PI / 2);
        return (
          <path
            key={i}
            d={`M${a1x},${a1y} A${chairR},${chairR} 0 0,1 ${a2x},${a2y} Z`}
            fill={fillLight}
            stroke={stroke}
            strokeWidth="3"
          />
        );
      })}
      <rect x={tx} y={ty} width={tw} height={th} rx="6" fill={fill} stroke={stroke} strokeWidth="4" />
    </>
  );
}

/** Bar counter: long rounded rect with stools on one side */
function BarSvg() {
  return (
    <>
      {/* Stools along bottom */}
      {[48, 86, 124, 162].map((sx) => (
        <circle key={sx} cx={sx} cy="112" r="10" fill={fillLight} stroke={stroke} strokeWidth="3" />
      ))}
      {/* Counter surface */}
      <rect x="22" y="30" width="156" height="58" rx="8" fill={fill} stroke={stroke} strokeWidth="4" />
      <line x1="30" y1="58" x2="170" y2="58" stroke={strokeSoft} strokeWidth="2" />
    </>
  );
}

/** Corner bench: L-shaped top-down banquette */
function CornerBenchSvg() {
  return (
    <path
      d="M28,24 L172,24 L172,52 L80,52 L80,120 L28,120 Z"
      fill={fillDeep}
      stroke={stroke}
      strokeWidth="4"
      strokeLinejoin="round"
    />
  );
}

/** Banquette: long padded wall seat */
function BanquetteSvg() {
  return (
    <>
      <rect x="20" y="40" width="160" height="28" rx="4" fill={fillDeep} stroke={stroke} strokeWidth="4" />
      <rect x="20" y="68" width="160" height="36" rx="4" fill={fillLight} stroke={stroke} strokeWidth="3" />
      {/* Seat dividers */}
      <line x1="60" y1="68" x2="60" y2="104" stroke={strokeSoft} strokeWidth="1.5" />
      <line x1="100" y1="68" x2="100" y2="104" stroke={strokeSoft} strokeWidth="1.5" />
      <line x1="140" y1="68" x2="140" y2="104" stroke={strokeSoft} strokeWidth="1.5" />
    </>
  );
}

/** Booth: enclosed seating with table in center */
function BoothSvg() {
  return (
    <>
      {/* Left bench */}
      <rect x="22" y="28" width="28" height="84" rx="4" fill={fillDeep} stroke={stroke} strokeWidth="3" />
      {/* Right bench */}
      <rect x="150" y="28" width="28" height="84" rx="4" fill={fillDeep} stroke={stroke} strokeWidth="3" />
      {/* Table surface */}
      <rect x="58" y="36" width="84" height="68" rx="4" fill={fill} stroke={stroke} strokeWidth="3" />
    </>
  );
}

/** Host stand: small podium from above */
function HostStandSvg() {
  return (
    <>
      <rect x="56" y="28" width="88" height="84" rx="6" fill={fillLight} stroke={stroke} strokeWidth="4" />
      <rect x="66" y="36" width="68" height="32" rx="4" fill={fill} stroke={strokeSoft} strokeWidth="2" />
      <circle cx="100" cy="92" r="8" fill={accent} stroke={stroke} strokeWidth="2" />
    </>
  );
}

/** Divider / screen: thin line with posts */
function DividerSvg() {
  return (
    <>
      <rect x="18" y="58" width="164" height="12" rx="3" fill={fill} stroke={stroke} strokeWidth="3" />
      {[34, 66, 100, 134, 166].map((px) => (
        <circle key={px} cx={px} cy="64" r="5" fill={strokeSoft} stroke={stroke} strokeWidth="2" />
      ))}
    </>
  );
}

/** Plant pot from above */
function PlantSvg() {
  return (
    <>
      <circle cx="100" cy="70" r="40" fill={plant} stroke={plantDeep} strokeWidth="4" />
      {/* Leaf shapes */}
      {[0, 72, 144, 216, 288].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const lx = 100 + 20 * Math.cos(a);
        const ly = 70 + 20 * Math.sin(a);
        const ex = 100 + 38 * Math.cos(a);
        const ey = 70 + 38 * Math.sin(a);
        const cx1 = 100 + 32 * Math.cos(a - 0.3);
        const cy1 = 70 + 32 * Math.sin(a - 0.3);
        const cx2 = 100 + 32 * Math.cos(a + 0.3);
        const cy2 = 70 + 32 * Math.sin(a + 0.3);
        return (
          <path
            key={deg}
            d={`M${lx},${ly} Q${cx1},${cy1} ${ex},${ey} Q${cx2},${cy2} ${lx},${ly}`}
            fill={plantDeep}
            opacity="0.4"
            stroke="none"
          />
        );
      })}
      <circle cx="100" cy="70" r="12" fill={plantDeep} stroke={stroke} strokeWidth="2" opacity="0.5" />
    </>
  );
}

/** Service station: small cabinet from above */
function ServiceStationSvg() {
  return (
    <>
      <rect x="34" y="32" width="132" height="76" rx="6" fill={fillLight} stroke={stroke} strokeWidth="4" />
      <line x1="100" y1="32" x2="100" y2="108" stroke={strokeSoft} strokeWidth="2" />
      <line x1="34" y1="70" x2="166" y2="70" stroke={strokeSoft} strokeWidth="2" />
      <circle cx="67" cy="51" r="6" fill={accent} stroke={stroke} strokeWidth="2" />
      <circle cx="133" cy="51" r="6" fill={accent} stroke={stroke} strokeWidth="2" />
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Dispatcher
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ItemSvg({
  kind,
  shape,
  capacity,
  seatType,
}: {
  kind: FloorPlanItemKind;
  shape?: FloorPlanTableShape;
  capacity?: number;
  seatType?: FloorPlanSeatType;
}) {
  if (kind === "table") {
    if (capacity && capacity > 0) {
      return <DynamicTableSvg shape={shape || "rect"} capacity={capacity} seatType={seatType} />;
    }
    return shape === "round" ? <RoundTableSvg /> : <RectTableSvg />;
  }

  switch (kind) {
    case "chair":
      return <ChairSvg />;
    case "stool":
      return <StoolSvg />;
    case "bar":
      return <BarSvg />;
    case "corner-bench":
      return <CornerBenchSvg />;
    case "banquette":
      return <BanquetteSvg />;
    case "booth":
      return <BoothSvg />;
    case "host-stand":
      return <HostStandSvg />;
    case "divider":
      return <DividerSvg />;
    case "plant":
      return <PlantSvg />;
    case "service-station":
      return <ServiceStationSvg />;
    default:
      return <RectTableSvg />;
  }
}

export function FloorPlanItemIllustration({
  kind,
  shape = "rect",
  className,
  decorative = true,
  capacity,
  seatType,
}: FloorPlanItemIllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 140"
      className={cn("h-full w-full", className)}
      fill="none"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative}
      preserveAspectRatio="xMidYMid meet"
    >
      <ItemSvg kind={kind} shape={shape} capacity={capacity} seatType={seatType} />
    </svg>
  );
}

export function FloorPlanPresetIcon({
  kind,
  shape = "rect",
  className,
}: Pick<FloorPlanItemIllustrationProps, "kind" | "shape" | "className">) {
  return (
    <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border bg-white/90 p-1.5 shadow-sm", className)}>
      <FloorPlanItemIllustration kind={kind} shape={shape} className="h-full w-full" />
    </div>
  );
}
