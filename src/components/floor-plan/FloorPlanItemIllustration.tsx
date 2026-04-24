import type {
  FloorPlanCornerBenchConfig,
  FloorPlanCornerBenchCorner,
  FloorPlanItemKind,
  FloorPlanSeatPlacement,
  FloorPlanSeatType,
  FloorPlanTableShape,
} from "@/lib/floorPlan";
import { cn } from "@/lib/utils";
import DynamicTableSvg from "./DynamicTableSvg";

type FloorPlanItemIllustrationProps = {
  kind: FloorPlanItemKind;
  shape?: FloorPlanTableShape;
  className?: string;
  decorative?: boolean;
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
};

const stroke = "#6d4d33";
const strokeSoft = "#9a7754";
const shadow = "rgba(15,23,42,0.12)";

function IllustrationDefs() {
  return (
    <defs>
      <linearGradient id="fp-item-surface" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ead2b0" />
        <stop offset="100%" stopColor="#caa174" />
      </linearGradient>
      <linearGradient id="fp-item-deep" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d5a37d" />
        <stop offset="100%" stopColor="#b77d56" />
      </linearGradient>
      <linearGradient id="fp-item-seat" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff8ef" />
        <stop offset="100%" stopColor="#ecd4b4" />
      </linearGradient>
      <linearGradient id="fp-item-panel" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#eef3f7" />
        <stop offset="100%" stopColor="#dbe5ef" />
      </linearGradient>
      <radialGradient id="fp-item-plant" cx="50%" cy="42%" r="64%">
        <stop offset="0%" stopColor="#b9d8a3" />
        <stop offset="100%" stopColor="#6d975b" />
      </radialGradient>
    </defs>
  );
}

function ChairSvg() {
  return (
    <>
      <ellipse cx="100" cy="94" rx="36" ry="18" fill={shadow} />
      <path
        d="M56,82 C56,60 72,44 100,44 C128,44 144,60 144,82 L144,92 C144,102 136,110 126,110 L74,110 C64,110 56,102 56,92 Z"
        fill="url(#fp-item-seat)"
        stroke={stroke}
        strokeWidth="4"
      />
      <path
        d="M66,56 C74,44 88,38 100,38 C112,38 126,44 134,56"
        fill="none"
        stroke={strokeSoft}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="74" y="62" width="52" height="32" rx="16" fill="none" stroke="#f4e1c5" strokeWidth="2" opacity="0.8" />
    </>
  );
}

function StoolSvg() {
  return (
    <>
      <ellipse cx="100" cy="90" rx="28" ry="14" fill={shadow} />
      <circle cx="100" cy="70" r="32" fill="url(#fp-item-seat)" stroke={stroke} strokeWidth="4" />
      <circle cx="100" cy="70" r="17" fill="none" stroke={strokeSoft} strokeWidth="2.5" opacity="0.8" />
      <circle cx="100" cy="70" r="4" fill={strokeSoft} opacity="0.85" />
    </>
  );
}

function RoundTableSvg() {
  return <DynamicTableSvg shape="round" capacity={4} />;
}

function RectTableSvg() {
  return <DynamicTableSvg shape="rect" capacity={6} />;
}

function BarSvg() {
  return (
    <>
      <ellipse cx="100" cy="103" rx="68" ry="14" fill={shadow} />
      {[48, 76, 124, 152].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy="112" rx="11" ry="6.5" fill={shadow} opacity="0.9" />
          <circle cx={cx} cy="101" r="11" fill="url(#fp-item-seat)" stroke={stroke} strokeWidth="3" />
        </g>
      ))}
      <rect x="22" y="34" width="156" height="44" rx="18" fill="url(#fp-item-deep)" stroke={stroke} strokeWidth="4" />
      <rect x="34" y="42" width="132" height="16" rx="8" fill="url(#fp-item-seat)" opacity="0.5" />
      <rect x="30" y="78" width="140" height="18" rx="9" fill="url(#fp-item-surface)" stroke={strokeSoft} strokeWidth="2.5" />
    </>
  );
}

function CornerBenchSvg() {
  return (
    <>
      <path
        d="M22,26 L178,26 L178,58 L102,58 L102,118 L22,118 Z"
        fill="url(#fp-item-deep)"
        stroke={stroke}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M30,34 L170,34 L170,48 L94,48 L94,110 L30,110 Z"
        fill="url(#fp-item-seat)"
        opacity="0.72"
      />
      <path d="M102,58 L102,118" fill="none" stroke={strokeSoft} strokeWidth="3" opacity="0.45" />
    </>
  );
}

function BanquetteSvg() {
  return (
    <>
      <ellipse cx="100" cy="84" rx="64" ry="18" fill={shadow} />
      <rect x="24" y="32" width="152" height="26" rx="12" fill="url(#fp-item-deep)" stroke={stroke} strokeWidth="4" />
      <rect x="24" y="60" width="152" height="34" rx="15" fill="url(#fp-item-seat)" stroke={stroke} strokeWidth="3" />
      {[60, 100, 140].map((x) => (
        <line key={x} x1={x} y1="62" x2={x} y2="92" stroke={strokeSoft} strokeWidth="2" opacity="0.5" />
      ))}
    </>
  );
}

function BoothSvg() {
  return (
    <>
      <ellipse cx="100" cy="94" rx="54" ry="18" fill={shadow} />
      <rect x="20" y="28" width="34" height="84" rx="14" fill="url(#fp-item-deep)" stroke={stroke} strokeWidth="3.5" />
      <rect x="146" y="28" width="34" height="84" rx="14" fill="url(#fp-item-deep)" stroke={stroke} strokeWidth="3.5" />
      <rect x="56" y="36" width="88" height="68" rx="14" fill="url(#fp-item-surface)" stroke={stroke} strokeWidth="3.5" />
      <rect x="66" y="46" width="68" height="48" rx="10" fill="url(#fp-item-seat)" opacity="0.55" />
    </>
  );
}

function HostStandSvg() {
  return (
    <>
      <ellipse cx="100" cy="92" rx="34" ry="14" fill={shadow} />
      <rect x="58" y="28" width="84" height="86" rx="18" fill="url(#fp-item-surface)" stroke={stroke} strokeWidth="4" />
      <path d="M70,42 H130" stroke={strokeSoft} strokeWidth="3" strokeLinecap="round" />
      <rect x="72" y="50" width="56" height="24" rx="10" fill="url(#fp-item-panel)" stroke={strokeSoft} strokeWidth="2.5" />
      <circle cx="100" cy="92" r="8" fill="#e3a65c" stroke={stroke} strokeWidth="2.5" />
    </>
  );
}

function DividerSvg() {
  return (
    <>
      <ellipse cx="100" cy="80" rx="72" ry="10" fill={shadow} />
      {[34, 100, 166].map((cx) => (
        <rect key={cx} x={cx - 5} y="42" width="10" height="44" rx="5" fill="url(#fp-item-deep)" stroke={stroke} strokeWidth="2" />
      ))}
      <rect x="24" y="48" width="52" height="22" rx="11" fill="url(#fp-item-panel)" stroke={strokeSoft} strokeWidth="2" />
      <rect x="74" y="48" width="52" height="22" rx="11" fill="url(#fp-item-panel)" stroke={strokeSoft} strokeWidth="2" />
      <rect x="124" y="48" width="52" height="22" rx="11" fill="url(#fp-item-panel)" stroke={strokeSoft} strokeWidth="2" />
    </>
  );
}

function PlantSvg() {
  return (
    <>
      <ellipse cx="100" cy="96" rx="30" ry="12" fill={shadow} />
      <circle cx="100" cy="68" r="38" fill="url(#fp-item-plant)" stroke="#4d7340" strokeWidth="4" />
      {[0, 72, 144, 216, 288].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const lx = 100 + 8 * Math.cos(a);
        const ly = 68 + 8 * Math.sin(a);
        const ex = 100 + 28 * Math.cos(a);
        const ey = 68 + 28 * Math.sin(a);
        const cx1 = 100 + 24 * Math.cos(a - 0.24);
        const cy1 = 68 + 24 * Math.sin(a - 0.24);
        const cx2 = 100 + 24 * Math.cos(a + 0.24);
        const cy2 = 68 + 24 * Math.sin(a + 0.24);

        return (
          <path
            key={deg}
            d={`M${lx},${ly} Q${cx1},${cy1} ${ex},${ey} Q${cx2},${cy2} ${lx},${ly}`}
            fill="#537d46"
            opacity="0.45"
          />
        );
      })}
      <circle cx="100" cy="68" r="13" fill="#5d834e" opacity="0.65" />
    </>
  );
}

function ServiceStationSvg() {
  return (
    <>
      <ellipse cx="100" cy="92" rx="52" ry="14" fill={shadow} />
      <rect x="38" y="30" width="124" height="80" rx="16" fill="url(#fp-item-surface)" stroke={stroke} strokeWidth="4" />
      <rect x="48" y="40" width="104" height="22" rx="10" fill="url(#fp-item-panel)" stroke={strokeSoft} strokeWidth="2.5" />
      <line x1="100" y1="64" x2="100" y2="100" stroke={strokeSoft} strokeWidth="2.5" opacity="0.55" />
      <line x1="52" y1="82" x2="148" y2="82" stroke={strokeSoft} strokeWidth="2.5" opacity="0.55" />
      <circle cx="78" cy="52" r="3.5" fill={strokeSoft} />
      <circle cx="122" cy="52" r="3.5" fill={strokeSoft} />
    </>
  );
}

function ItemSvg({
  kind,
  shape,
  capacity,
  seatType,
  seatPlacements,
  cornerBenchCorners,
  cornerBenchConfigs,
  tableWidth,
  tableHeight,
  cornerBenchHorizontal,
  cornerBenchVertical,
  cornerBenchDepth,
}: {
  kind: FloorPlanItemKind;
  shape?: FloorPlanTableShape;
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
}) {
  if (kind === "table") {
    if (capacity && capacity > 0) {
      return (
        <DynamicTableSvg
          shape={shape || "rect"}
          capacity={capacity}
          seatType={seatType}
          seatPlacements={seatPlacements}
          cornerBenchCorners={cornerBenchCorners}
          cornerBenchConfigs={cornerBenchConfigs}
          tableWidth={tableWidth}
          tableHeight={tableHeight}
          cornerBenchHorizontal={cornerBenchHorizontal}
          cornerBenchVertical={cornerBenchVertical}
          cornerBenchDepth={cornerBenchDepth}
        />
      );
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
  seatPlacements,
  cornerBenchCorners,
  cornerBenchConfigs,
  tableWidth,
  tableHeight,
  cornerBenchHorizontal,
  cornerBenchVertical,
  cornerBenchDepth,
}: FloorPlanItemIllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 140"
      className={cn("block h-full w-full", className)}
      fill="none"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative}
      preserveAspectRatio="xMidYMid meet"
    >
      <IllustrationDefs />
      <ItemSvg
        kind={kind}
        shape={shape}
        capacity={capacity}
        seatType={seatType}
        seatPlacements={seatPlacements}
        cornerBenchCorners={cornerBenchCorners}
        cornerBenchConfigs={cornerBenchConfigs}
        tableWidth={tableWidth}
        tableHeight={tableHeight}
        cornerBenchHorizontal={cornerBenchHorizontal}
        cornerBenchVertical={cornerBenchVertical}
        cornerBenchDepth={cornerBenchDepth}
      />
    </svg>
  );
}

export function FloorPlanPresetIcon({
  kind,
  shape = "rect",
  className,
}: Pick<FloorPlanItemIllustrationProps, "kind" | "shape" | "className">) {
  return (
    <div className={cn("flex h-16 w-16 items-center justify-center rounded-[22px] border border-slate-200 bg-white/90 p-2 shadow-sm", className)}>
      <FloorPlanItemIllustration kind={kind} shape={shape} className="block h-full w-full" />
    </div>
  );
}
