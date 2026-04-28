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
import { FLOOR_PLAN_ASSETS } from "./floorPlanAssets";

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

function SvgAsset({
  assetId,
  x,
  y,
  width,
  height,
  rotation,
  preserveAspectRatio = "xMidYMid meet",
}: {
  assetId: keyof typeof FLOOR_PLAN_ASSETS;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  preserveAspectRatio?: string;
}) {
  const asset = FLOOR_PLAN_ASSETS[assetId];
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  return (
    <image
      href={asset.src}
      x={x}
      y={y}
      width={width}
      height={height}
      preserveAspectRatio={preserveAspectRatio}
      transform={rotation == null ? undefined : `rotate(${rotation} ${centerX} ${centerY})`}
    />
  );
}

function ChairSvg() {
  return (
    <>
      <ellipse cx="100" cy="99" rx="34" ry="16" fill={shadow} />
      <SvgAsset assetId="chair" x={40} y={18} width={120} height={108} />
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
  return (
    <>
      <ellipse cx="100" cy="104" rx="46" ry="16" fill={shadow} />
      <SvgAsset assetId="round-table-angled" x={40} y={14} width={120} height={112} />
    </>
  );
}

function RectTableSvg() {
  return (
    <>
      <ellipse cx="100" cy="100" rx="54" ry="18" fill={shadow} />
      <SvgAsset assetId="rect-table-top" x={38} y={18} width={124} height={98} />
    </>
  );
}

function BarSvg() {
  return (
    <>
      <ellipse cx="100" cy="96" rx="70" ry="12" fill={shadow} />
      <SvgAsset assetId="bar-top" x={18} y={56} width={164} height={40} preserveAspectRatio="none" />
    </>
  );
}

function CornerBenchSvg() {
  return (
    <>
      <ellipse cx="102" cy="96" rx="58" ry="15" fill={shadow} opacity="0.78" />
      <SvgAsset assetId="corner-bench" x={22} y={24} width={156} height={96} preserveAspectRatio="none" />
    </>
  );
}

function BanquetteSvg() {
  return (
    <>
      <ellipse cx="100" cy="98" rx="64" ry="16" fill={shadow} opacity="0.76" />
      <SvgAsset assetId="banquette-straight" x={22} y={20} width={156} height={102} preserveAspectRatio="none" />
    </>
  );
}

function BoothSvg() {
  return (
    <>
      <ellipse cx="100" cy="98" rx="54" ry="16" fill={shadow} opacity="0.76" />
      <SvgAsset assetId="banquette-end" x={18} y={18} width={36} height={102} preserveAspectRatio="none" />
      <SvgAsset assetId="banquette-end" x={146} y={18} width={36} height={102} rotation={180} preserveAspectRatio="none" />
      <SvgAsset assetId="rect-table-top" x={60} y={30} width={80} height={84} preserveAspectRatio="none" />
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
      <ellipse cx="100" cy="106" rx="46" ry="10" fill={shadow} opacity="0.6" />
      <SvgAsset assetId="divider-open" x={42} y={10} width={116} height={112} />
    </>
  );
}

function PlantSvg() {
  return (
    <>
      <ellipse cx="100" cy="104" rx="30" ry="12" fill={shadow} opacity="0.7" />
      <SvgAsset assetId="plant" x={40} y={16} width={120} height={108} />
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
