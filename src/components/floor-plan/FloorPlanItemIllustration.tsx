import type { FloorPlanItemKind, FloorPlanTableShape } from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

type FloorPlanItemIllustrationProps = {
  kind: FloorPlanItemKind;
  shape?: FloorPlanTableShape;
  className?: string;
  decorative?: boolean;
};

const stroke = "#87623f";
const strokeSoft = "#b6906b";
const fill = "#fff7ed";
const fillSoft = "#f4dfc4";
const fillDeep = "#edd0a8";
const accent = "#f1b65d";
const plant = "#b7d7b0";
const plantDeep = "#7ba86f";

function ChairSvg() {
  return (
    <>
      <rect x="52" y="26" width="96" height="42" rx="18" fill={fillSoft} stroke={stroke} strokeWidth="6" />
      <rect x="62" y="74" width="76" height="42" rx="18" fill={fill} stroke={stroke} strokeWidth="6" />
      <path d="M74 116v22M126 116v22M60 52V22M140 52V22" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
      <path d="M76 26h48" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function StoolSvg() {
  return (
    <>
      <circle cx="100" cy="52" r="34" fill={fillSoft} stroke={stroke} strokeWidth="6" />
      <path d="M78 84l-16 34M122 84l16 34M88 86v38M112 86v38" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
      <path d="M66 118h68" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function RoundTableSvg() {
  return (
    <>
      <circle cx="100" cy="70" r="46" fill={fill} stroke={stroke} strokeWidth="6" />
      <circle cx="100" cy="70" r="28" fill="#fffdfa" stroke={strokeSoft} strokeWidth="4" />
      <circle cx="100" cy="12" r="15" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <circle cx="100" cy="128" r="15" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <circle cx="42" cy="70" r="15" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <circle cx="158" cy="70" r="15" fill={fillSoft} stroke={stroke} strokeWidth="5" />
    </>
  );
}

function RectTableSvg() {
  return (
    <>
      <rect x="34" y="28" width="132" height="84" rx="22" fill={fill} stroke={stroke} strokeWidth="6" />
      <rect x="56" y="42" width="88" height="56" rx="16" fill="#fffdfa" stroke={strokeSoft} strokeWidth="4" />
      <rect x="56" y="6" width="30" height="24" rx="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <rect x="114" y="6" width="30" height="24" rx="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <rect x="56" y="110" width="30" height="24" rx="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <rect x="114" y="110" width="30" height="24" rx="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <rect x="8" y="44" width="24" height="30" rx="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <rect x="168" y="44" width="24" height="30" rx="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
    </>
  );
}

function BarSvg() {
  return (
    <>
      <path d="M22 58c0-18 14-32 32-32h94c16 0 30 10 34 25l8 29c3 12-6 24-18 24H52c-17 0-30-14-30-30V58Z" fill={fill} stroke={stroke} strokeWidth="6" />
      <path d="M46 48h112" stroke={strokeSoft} strokeWidth="5" strokeLinecap="round" />
      <path d="M44 68h120" stroke={strokeSoft} strokeWidth="5" strokeLinecap="round" />
      <circle cx="48" cy="114" r="12" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <circle cx="86" cy="124" r="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <circle cx="124" cy="124" r="10" fill={fillSoft} stroke={stroke} strokeWidth="5" />
      <circle cx="162" cy="114" r="12" fill={fillSoft} stroke={stroke} strokeWidth="5" />
    </>
  );
}

function CornerBenchSvg() {
  return (
    <>
      <path d="M28 26h126c10 0 18 8 18 18v24H78v74H46c-10 0-18-8-18-18V26Z" fill={fill} stroke={stroke} strokeWidth="6" />
      <path d="M28 26h126c10 0 18 8 18 18v10H36c-4 0-8 4-8 8V26Z" fill={fillDeep} stroke={stroke} strokeWidth="6" />
      <path d="M46 88v54M78 68h94M114 68v74M146 68v74" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
      <path d="M52 56h28M86 56h28M120 56h28" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function BanquetteSvg() {
  return (
    <>
      <rect x="20" y="34" width="160" height="42" rx="18" fill={fillDeep} stroke={stroke} strokeWidth="6" />
      <rect x="20" y="74" width="160" height="42" rx="18" fill={fill} stroke={stroke} strokeWidth="6" />
      <path d="M36 76v40M72 76v40M108 76v40M144 76v40" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function BoothSvg() {
  return (
    <>
      <rect x="18" y="24" width="164" height="92" rx="26" fill={fill} stroke={stroke} strokeWidth="6" />
      <rect x="34" y="36" width="42" height="68" rx="18" fill={fillDeep} stroke={stroke} strokeWidth="5" />
      <rect x="124" y="36" width="42" height="68" rx="18" fill={fillDeep} stroke={stroke} strokeWidth="5" />
      <rect x="82" y="42" width="36" height="56" rx="12" fill="#fffdfa" stroke={strokeSoft} strokeWidth="4" />
      <path d="M84 62h32M84 78h32" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function HostStandSvg() {
  return (
    <>
      <path d="M58 22h84v84l-42 20-42-20V22Z" fill={fill} stroke={stroke} strokeWidth="6" />
      <path d="M58 48h84" stroke={strokeSoft} strokeWidth="4" />
      <path d="M74 102h52" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
      <rect x="82" y="4" width="36" height="24" rx="10" fill={accent} stroke={stroke} strokeWidth="5" />
    </>
  );
}

function DividerSvg() {
  return (
    <>
      <rect x="18" y="46" width="164" height="22" rx="11" fill={fillDeep} stroke={stroke} strokeWidth="6" />
      <path d="M34 46V22M66 46V16M98 46V24M130 46V16M162 46V22" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
      <path d="M34 68v44M66 68v50M98 68v42M130 68v50M162 68v44" stroke={strokeSoft} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function PlantSvg() {
  return (
    <>
      <circle cx="100" cy="84" r="44" fill={plant} stroke={plantDeep} strokeWidth="6" />
      <path d="M100 34c10 10 12 24 2 34-12-6-18-18-2-34ZM74 48c14 2 24 12 26 24-14 4-28-4-26-24ZM126 48c-14 2-24 12-26 24 14 4 28-4 26-24ZM72 88c16 0 26 10 28 24-14 6-32-2-28-24ZM128 88c-16 0-26 10-28 24 14 6 32-2 28-24Z" fill="#d7efd2" stroke={plantDeep} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M82 118h36l-8 18H90l-8-18Z" fill={fillDeep} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
    </>
  );
}

function ServiceStationSvg() {
  return (
    <>
      <rect x="34" y="28" width="132" height="82" rx="18" fill={fill} stroke={stroke} strokeWidth="6" />
      <path d="M34 56h132M100 28v82" stroke={strokeSoft} strokeWidth="4" />
      <rect x="56" y="116" width="88" height="16" rx="8" fill={fillDeep} stroke={stroke} strokeWidth="5" />
      <circle cx="66" cy="74" r="10" fill={accent} stroke={stroke} strokeWidth="4" />
      <circle cx="134" cy="74" r="10" fill={accent} stroke={stroke} strokeWidth="4" />
    </>
  );
}

function ItemSvg({ kind, shape }: { kind: FloorPlanItemKind; shape?: FloorPlanTableShape }) {
  if (kind === "table") {
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
}: FloorPlanItemIllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 140"
      className={cn("h-full w-full", className)}
      fill="none"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative}
      preserveAspectRatio="none"
    >
      <ItemSvg kind={kind} shape={shape} />
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
