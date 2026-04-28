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
};

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
  return <SvgAsset assetId="chair" x={42} y={8} width={116} height={124} />;
}

function StoolSvg() {
  return <SvgAsset assetId="stool" x={48} y={10} width={104} height={120} />;
}

function RoundTableSvg() {
  return <SvgAsset assetId="round-table-angled" x={40} y={10} width={120} height={120} />;
}

function RectTableSvg() {
  return <SvgAsset assetId="rect-table-top" x={42} y={10} width={116} height={120} preserveAspectRatio="none" />;
}

function BarSvg() {
  return <SvgAsset assetId="bar-top" x={18} y={48} width={164} height={48} preserveAspectRatio="none" />;
}

function CornerBenchSvg() {
  return <SvgAsset assetId="corner-bench" x={20} y={10} width={160} height={120} preserveAspectRatio="none" />;
}

function BanquetteSvg() {
  return <SvgAsset assetId="banquette-straight" x={22} y={10} width={156} height={120} preserveAspectRatio="none" />;
}

function BoothSvg() {
  return (
    <>
      <SvgAsset assetId="banquette-end" x={18} y={18} width={36} height={102} preserveAspectRatio="none" />
      <SvgAsset assetId="banquette-end" x={146} y={18} width={36} height={102} rotation={180} preserveAspectRatio="none" />
      <SvgAsset assetId="rect-table-top" x={60} y={30} width={80} height={84} preserveAspectRatio="none" />
    </>
  );
}

function HostStandSvg() {
  return <SvgAsset assetId="host-stand" x={44} y={8} width={112} height={124} />;
}

function DividerSvg() {
  return <SvgAsset assetId="divider-open" x={50} y={6} width={100} height={128} />;
}

function PlantSvg() {
  return <SvgAsset assetId="plant" x={40} y={8} width={120} height={124} />;
}

function ServiceStationSvg() {
  return <SvgAsset assetId="service-station" x={24} y={26} width={152} height={88} preserveAspectRatio="none" />;
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
  preserveAspectRatio = "xMidYMid meet",
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
      preserveAspectRatio={preserveAspectRatio}
    >
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
