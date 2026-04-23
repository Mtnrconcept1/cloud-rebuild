import { useEffect, useMemo, useState } from "react";
import { Armchair, ChevronDown, ChevronUp, Footprints, Ruler, Sofa, Sparkles } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CORNER_BENCH_CORNERS,
  CORNER_BENCH_LABELS,
  getConfiguredTableCapacity,
  getDefaultBenchDimensions,
  getDefaultCornerBenchDimensions,
  getResolvedFloorPlanDimensions,
  RECT_SEAT_ZONES,
  RECT_SEAT_ZONE_LABELS,
  ROUND_SEAT_ZONES,
  ROUND_SEAT_ZONE_LABELS,
  SEAT_TYPE_LABELS,
  type FloorPlanCornerBenchConfig,
  type FloorPlanCornerBenchCorner,
  type FloorPlanLinearSeatType,
  type FloorPlanSeatPlacement,
  type FloorPlanSeatType,
  type FloorPlanSeatZone,
  type FloorPlanTablePreset,
  type FloorPlanTableShape,
} from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

import { FloorPlanItemIllustration } from "./FloorPlanItemIllustration";

type TableConfig = {
  capacity: number;
  shape: FloorPlanTableShape;
  seatType: FloorPlanSeatType;
  seatPlacements: FloorPlanSeatPlacement[];
  cornerBenchConfigs: FloorPlanCornerBenchConfig[];
  tableWidth: number;
  tableHeight: number;
};

type TableConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig: TableConfig | null;
  preset: FloorPlanTablePreset | null;
  onConfirm: (config: TableConfig) => void;
};

type ZoneSeatState = {
  enabled: boolean;
  type: FloorPlanLinearSeatType;
  count: number;
  benchLength: number;
  benchDepth: number;
};

type CornerBenchState = {
  enabled: boolean;
  horizontal: number;
  vertical: number;
  depth: number;
};

type TableLayoutPreset = "balanced" | "stools" | "bench-one-side" | "bench-two-sides" | "corner" | "custom";

const LINEAR_SEAT_OPTIONS: FloorPlanLinearSeatType[] = ["chair", "stool", "bench"];
const ALL_ZONES: FloorPlanSeatZone[] = [...RECT_SEAT_ZONES, ...ROUND_SEAT_ZONES];
const ROUND_LAYOUT_PRESETS: TableLayoutPreset[] = ["balanced", "stools", "custom"];
const RECT_LAYOUT_PRESETS: TableLayoutPreset[] = ["balanced", "stools", "bench-one-side", "bench-two-sides", "corner", "custom"];
const LAYOUT_PRESET_COPY: Record<TableLayoutPreset, { label: string; description: string; tone: string }> = {
  balanced: {
    label: "Équilibré",
    description: "Répartition automatique classique, idéale pour aller vite sans réfléchir aux côtés.",
    tone: "bg-sky-50 text-sky-700",
  },
  stools: {
    label: "Tabourets",
    description: "Même logique automatique, mais pensée pour une ambiance comptoir ou snack.",
    tone: "bg-violet-50 text-violet-700",
  },
  "bench-one-side": {
    label: "Banquette d'un côté",
    description: "Une banquette sur la longueur et les places restantes en face. Pratique pour les murs.",
    tone: "bg-amber-50 text-amber-700",
  },
  "bench-two-sides": {
    label: "Banquettes face à face",
    description: "Deux longues banquettes opposées, idéale pour les tables rectangulaires centrales.",
    tone: "bg-orange-50 text-orange-700",
  },
  corner: {
    label: "Angle",
    description: "Un coin banquette prêt à poser, puis des places simples pour compléter sans superposition.",
    tone: "bg-emerald-50 text-emerald-700",
  },
  custom: {
    label: "Manuel",
    description: "Déverrouillez chaque zone uniquement si vous avez un besoin atypique à affiner à la main.",
    tone: "bg-slate-100 text-slate-700",
  },
};

function clampInput(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : fallback;
}

function getPrimarySeatType(
  placements: FloorPlanSeatPlacement[],
  cornerBenchConfigs: FloorPlanCornerBenchConfig[],
): FloorPlanSeatType {
  if (cornerBenchConfigs.length > 0) return "corner-bench";

  const weights = placements.reduce<Record<FloorPlanLinearSeatType, number>>((accumulator, placement) => {
    accumulator[placement.type] += placement.count;
    return accumulator;
  }, { chair: 0, stool: 0, bench: 0 });

  if (weights.bench >= weights.chair && weights.bench >= weights.stool) return "bench";
  if (weights.stool >= weights.chair && weights.stool >= weights.bench) return "stool";
  return "chair";
}

function createZoneSeatState(
  placements: FloorPlanSeatPlacement[],
  tableWidth: number,
  tableHeight: number,
) {
  const state = Object.fromEntries(
    ALL_ZONES.map((zone) => {
      const defaults = getDefaultBenchDimensions(tableWidth, tableHeight, zone, 2);
      return [zone, {
        enabled: false,
        type: "chair" as FloorPlanLinearSeatType,
        count: 1,
        benchLength: defaults.benchLength,
        benchDepth: defaults.benchDepth,
      }];
    }),
  ) as Record<FloorPlanSeatZone, ZoneSeatState>;

  placements.forEach((placement) => {
    const defaults = getDefaultBenchDimensions(tableWidth, tableHeight, placement.zone, placement.count);
    state[placement.zone] = {
      enabled: placement.count > 0,
      type: placement.type,
      count: Math.max(1, placement.count),
      benchLength: placement.benchLength ?? defaults.benchLength,
      benchDepth: placement.benchDepth ?? defaults.benchDepth,
    };
  });

  return state;
}

function createCornerBenchState(
  configs: FloorPlanCornerBenchConfig[],
  tableWidth: number,
  tableHeight: number,
) {
  const defaults = getDefaultCornerBenchDimensions(tableWidth, tableHeight);
  const state = Object.fromEntries(
    CORNER_BENCH_CORNERS.map((corner) => [corner, {
      enabled: false,
      horizontal: defaults.cornerBenchHorizontal,
      vertical: defaults.cornerBenchVertical,
      depth: defaults.cornerBenchDepth,
    }]),
  ) as Record<FloorPlanCornerBenchCorner, CornerBenchState>;

  configs.forEach((config) => {
    state[config.corner] = {
      enabled: true,
      horizontal: config.horizontal,
      vertical: config.vertical,
      depth: config.depth,
    };
  });

  return state;
}

function buildSeatPlacements(
  shape: FloorPlanTableShape,
  zoneState: Record<FloorPlanSeatZone, ZoneSeatState>,
) {
  const zones = shape === "rect" ? RECT_SEAT_ZONES : ROUND_SEAT_ZONES;
  return zones.flatMap((zone) => {
    const config = zoneState[zone];
    if (!config?.enabled || config.count <= 0) return [];

    return [{
      zone,
      type: config.type,
      count: Math.max(1, Math.round(config.count)),
      ...(config.type === "bench"
        ? {
          benchLength: Math.max(24, Math.round(config.benchLength)),
          benchDepth: Math.max(12, Math.round(config.benchDepth)),
        }
        : {}),
    }];
  });
}

function buildCornerBenchConfigs(
  shape: FloorPlanTableShape,
  cornerState: Record<FloorPlanCornerBenchCorner, CornerBenchState>,
) {
  if (shape !== "rect") return [] as FloorPlanCornerBenchConfig[];

  return CORNER_BENCH_CORNERS.flatMap((corner) => {
    const config = cornerState[corner];
    return config.enabled
      ? [{
        corner,
        horizontal: Math.max(40, Math.round(config.horizontal)),
        vertical: Math.max(40, Math.round(config.vertical)),
        depth: Math.max(20, Math.round(config.depth)),
      }]
      : [];
  });
}

function buildDefaults(initialConfig: TableConfig | null, preset: FloorPlanTablePreset | null): TableConfig {
  if (initialConfig) {
    const resolved = getResolvedFloorPlanDimensions({
      capacity: initialConfig.capacity,
      shape: initialConfig.shape,
      seatType: initialConfig.seatType,
      seatPlacements: initialConfig.seatPlacements,
      cornerBenchConfigs: initialConfig.cornerBenchConfigs,
      tableWidth: initialConfig.tableWidth,
      tableHeight: initialConfig.tableHeight,
    });

    return {
      capacity: resolved.capacity,
      shape: initialConfig.shape,
      seatType: getPrimarySeatType(resolved.seatPlacements, resolved.cornerBenchConfigs),
      seatPlacements: resolved.seatPlacements,
      cornerBenchConfigs: resolved.cornerBenchConfigs,
      tableWidth: resolved.tableWidth,
      tableHeight: resolved.tableHeight,
    };
  }

  const fallbackShape = preset?.shape || "rect";
  const resolved = getResolvedFloorPlanDimensions({
    capacity: preset?.capacity || 4,
    shape: fallbackShape,
    footprintWidth: preset?.w,
    footprintHeight: preset?.h,
  });

  return {
    capacity: resolved.capacity,
    shape: fallbackShape,
    seatType: getPrimarySeatType(resolved.seatPlacements, resolved.cornerBenchConfigs),
    seatPlacements: resolved.seatPlacements,
    cornerBenchConfigs: resolved.cornerBenchConfigs,
    tableWidth: resolved.tableWidth,
    tableHeight: resolved.tableHeight,
  };
}

function normalizeLayoutPreset(shape: FloorPlanTableShape, preset: TableLayoutPreset): TableLayoutPreset {
  const available = shape === "round" ? ROUND_LAYOUT_PRESETS : RECT_LAYOUT_PRESETS;
  return available.includes(preset) ? preset : "balanced";
}

function inferLayoutPreset(config: TableConfig): TableLayoutPreset {
  if (config.shape === "rect" && config.cornerBenchConfigs.length > 0) {
    return "corner";
  }

  if (config.seatPlacements.length === 0) return "custom";
  if (config.seatPlacements.every((placement) => placement.type === "stool")) return "stools";
  if (config.seatPlacements.every((placement) => placement.type === "chair")) return "balanced";

  if (config.shape === "rect") {
    const benchPlacements = config.seatPlacements.filter((placement) => placement.type === "bench");
    const topBench = benchPlacements.some((placement) => placement.zone === "top");
    const bottomBench = benchPlacements.some((placement) => placement.zone === "bottom");

    if (benchPlacements.length === 2 && topBench && bottomBench) return "bench-two-sides";
    if (benchPlacements.length === 1) return "bench-one-side";
  }

  return "custom";
}

function createBenchPlacement(
  zone: FloorPlanSeatZone,
  count: number,
  tableWidth: number,
  tableHeight: number,
): FloorPlanSeatPlacement {
  const safeCount = Math.max(1, Math.round(count || 1));
  const defaults = getDefaultBenchDimensions(tableWidth, tableHeight, zone, safeCount);
  return {
    zone,
    type: "bench",
    count: safeCount,
    benchLength: defaults.benchLength,
    benchDepth: defaults.benchDepth,
  };
}

function buildAutomaticConfiguration({
  shape,
  preset,
  capacity,
  tableWidth,
  tableHeight,
}: {
  shape: FloorPlanTableShape;
  preset: TableLayoutPreset;
  capacity: number;
  tableWidth: number;
  tableHeight: number;
}) {
  const safeCapacity = Math.max(1, Math.round(capacity || 1));

  if (preset === "balanced" || preset === "stools") {
    const resolved = getResolvedFloorPlanDimensions({
      capacity: safeCapacity,
      shape,
      seatType: preset === "stools" ? "stool" : "chair",
      tableWidth,
      tableHeight,
    });

    return {
      seatPlacements: resolved.seatPlacements,
      cornerBenchConfigs: resolved.cornerBenchConfigs,
    };
  }

  if (shape === "round") {
    return buildAutomaticConfiguration({
      shape,
      preset: "balanced",
      capacity: safeCapacity,
      tableWidth,
      tableHeight,
    });
  }

  if (preset === "bench-one-side") {
    const benchCount = Math.max(1, Math.ceil(safeCapacity / 2));
    const chairCount = Math.max(0, safeCapacity - benchCount);
    return {
      seatPlacements: [
        createBenchPlacement("top", benchCount, tableWidth, tableHeight),
        ...(chairCount > 0 ? [{ zone: "bottom", type: "chair", count: chairCount } satisfies FloorPlanSeatPlacement] : []),
      ],
      cornerBenchConfigs: [] as FloorPlanCornerBenchConfig[],
    };
  }

  if (preset === "bench-two-sides") {
    const topCount = Math.max(1, Math.floor(safeCapacity / 2));
    const bottomCount = Math.max(1, safeCapacity - topCount);
    return {
      seatPlacements: [
        createBenchPlacement("top", topCount, tableWidth, tableHeight),
        createBenchPlacement("bottom", bottomCount, tableWidth, tableHeight),
      ],
      cornerBenchConfigs: [] as FloorPlanCornerBenchConfig[],
    };
  }

  if (preset === "corner") {
    const defaults = getDefaultCornerBenchDimensions(tableWidth, tableHeight);
    const remaining = Math.max(0, safeCapacity - 2);
    const seatPlacements: FloorPlanSeatPlacement[] = [];

    if (remaining > 0) {
      const bottomCount = Math.min(2, remaining);
      seatPlacements.push({ zone: "bottom", type: "chair", count: bottomCount });
      const extra = remaining - bottomCount;
      if (extra > 0) {
        const rightCount = Math.ceil(extra / 2);
        const leftCount = Math.max(0, extra - rightCount);
        if (rightCount > 0) seatPlacements.push({ zone: "right", type: "chair", count: rightCount });
        if (leftCount > 0) seatPlacements.push({ zone: "left", type: "chair", count: leftCount });
      }
    }

    return {
      seatPlacements,
      cornerBenchConfigs: [{
        corner: "top-left",
        horizontal: defaults.cornerBenchHorizontal,
        vertical: defaults.cornerBenchVertical,
        depth: defaults.cornerBenchDepth,
      }],
    };
  }

  return {
    seatPlacements: [] as FloorPlanSeatPlacement[],
    cornerBenchConfigs: [] as FloorPlanCornerBenchConfig[],
  };
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min={1}
          step={1}
          value={value}
          onChange={(event) => onChange(clampInput(Number(event.target.value), value))}
          className="h-11 min-w-0 rounded-2xl border-slate-200 bg-white pr-10 text-base font-semibold text-slate-900"
        />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-slate-400">cm</span>
      </div>
    </div>
  );
}

function LayoutPresetCard({
  preset,
  active,
  onClick,
}: {
  preset: TableLayoutPreset;
  active: boolean;
  onClick: () => void;
}) {
  const copy = LAYOUT_PRESET_COPY[preset];

  return (
    <button
      type="button"
      className={cn(
        "rounded-[24px] border px-4 py-4 text-left transition",
        active
          ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.8)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5">{copy.label}</p>
          <p className={cn("mt-2 text-sm leading-5", active ? "text-slate-200" : "text-slate-500")}>
            {copy.description}
          </p>
        </div>
        <span className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
          active ? "bg-white/12 text-white" : copy.tone,
        )}>
          {preset === "custom" ? "Manuel" : "Auto"}
        </span>
      </div>
    </button>
  );
}

function ZoneSeatCard({
  label,
  state,
  onToggle,
  onTypeChange,
  onCountChange,
  onBenchLengthChange,
  onBenchDepthChange,
}: {
  label: string;
  state: ZoneSeatState;
  onToggle: (checked: boolean) => void;
  onTypeChange: (type: FloorPlanLinearSeatType) => void;
  onCountChange: (count: number) => void;
  onBenchLengthChange: (value: number) => void;
  onBenchDepthChange: (value: number) => void;
}) {
  return (
    <div className={cn(
      "min-w-0 overflow-hidden rounded-[22px] border p-4 transition",
      state.enabled ? "border-slate-900 bg-slate-950/[0.03]" : "border-slate-200 bg-white",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-slate-900">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Une seule famille d'assise par zone pour empêcher les chevauchements.</p>
        </div>
        <Checkbox checked={state.enabled} onCheckedChange={(checked) => onToggle(checked === true)} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px]">
        <Select value={state.type} disabled={!state.enabled} onValueChange={(value) => onTypeChange(value as FloorPlanLinearSeatType)}>
          <SelectTrigger className="h-11 min-w-0 rounded-2xl border-slate-200 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINEAR_SEAT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {SEAT_TYPE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Input
            type="number"
            min={1}
            step={1}
            disabled={!state.enabled}
            value={state.count}
            onChange={(event) => onCountChange(clampInput(Number(event.target.value), state.count))}
            className="h-11 min-w-0 rounded-2xl border-slate-200 bg-white pr-10 text-center font-semibold"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            pl.
          </span>
        </div>
      </div>

      {state.enabled && state.type === "bench" ? (
        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(148px,1fr))]">
          <DimensionInput label="Longueur" value={state.benchLength} onChange={onBenchLengthChange} />
          <DimensionInput label="Profondeur" value={state.benchDepth} onChange={onBenchDepthChange} />
        </div>
      ) : null}
    </div>
  );
}

function CornerBenchCard({
  label,
  state,
  onModeChange,
  onHorizontalChange,
  onVerticalChange,
  onDepthChange,
}: {
  label: string;
  state: CornerBenchState;
  onModeChange: (enabled: boolean) => void;
  onHorizontalChange: (value: number) => void;
  onVerticalChange: (value: number) => void;
  onDepthChange: (value: number) => void;
}) {
  return (
    <div className={cn(
      "min-w-0 overflow-hidden rounded-[22px] border p-4 transition",
      state.enabled ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-slate-900">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Le coin garde sa propre profondeur et sa propre longueur pour rester lisible.</p>
        </div>
        <Sofa className={cn("h-4 w-4", state.enabled ? "text-amber-600" : "text-slate-300")} />
      </div>

      <div className="mt-4">
        <Select value={state.enabled ? "corner-bench" : "none"} onValueChange={(value) => onModeChange(value === "corner-bench")}>
          <SelectTrigger className="h-11 min-w-0 rounded-2xl border-slate-200 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun</SelectItem>
            <SelectItem value="corner-bench">Banc d'angle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state.enabled ? (
        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(126px,1fr))]">
          <DimensionInput label="Côté" value={state.horizontal} onChange={onHorizontalChange} />
          <DimensionInput label="Retour" value={state.vertical} onChange={onVerticalChange} />
          <DimensionInput label="Profondeur" value={state.depth} onChange={onDepthChange} />
        </div>
      ) : null}
    </div>
  );
}

export default function TableConfigDialog({
  open,
  onOpenChange,
  initialConfig,
  preset,
  onConfirm,
}: TableConfigDialogProps) {
  const isEditing = !!initialConfig;
  const defaults = useMemo(() => buildDefaults(initialConfig, preset), [initialConfig, preset]);

  const [shape, setShape] = useState<FloorPlanTableShape>(defaults.shape);
  const [targetCapacity, setTargetCapacity] = useState(defaults.capacity);
  const [layoutPreset, setLayoutPreset] = useState<TableLayoutPreset>(normalizeLayoutPreset(defaults.shape, inferLayoutPreset(defaults)));
  const [advancedOpen, setAdvancedOpen] = useState(layoutPreset === "custom");
  const [tableWidth, setTableWidth] = useState(defaults.tableWidth);
  const [tableHeight, setTableHeight] = useState(defaults.tableHeight);
  const [zoneState, setZoneState] = useState<Record<FloorPlanSeatZone, ZoneSeatState>>(
    () => createZoneSeatState(defaults.seatPlacements, defaults.tableWidth, defaults.tableHeight),
  );
  const [cornerBenchState, setCornerBenchState] = useState<Record<FloorPlanCornerBenchCorner, CornerBenchState>>(
    () => createCornerBenchState(defaults.cornerBenchConfigs, defaults.tableWidth, defaults.tableHeight),
  );

  useEffect(() => {
    if (!open) return;
    const nextPreset = normalizeLayoutPreset(defaults.shape, inferLayoutPreset(defaults));
    setShape(defaults.shape);
    setTargetCapacity(defaults.capacity);
    setLayoutPreset(nextPreset);
    setAdvancedOpen(nextPreset === "custom");
    setTableWidth(defaults.tableWidth);
    setTableHeight(defaults.tableHeight);
    setZoneState(createZoneSeatState(defaults.seatPlacements, defaults.tableWidth, defaults.tableHeight));
    setCornerBenchState(createCornerBenchState(defaults.cornerBenchConfigs, defaults.tableWidth, defaults.tableHeight));
  }, [defaults, open]);

  useEffect(() => {
    if (layoutPreset === "custom") return;

    const normalizedPreset = normalizeLayoutPreset(shape, layoutPreset);
    if (normalizedPreset !== layoutPreset) {
      setLayoutPreset(normalizedPreset);
      return;
    }

    const automatic = buildAutomaticConfiguration({
      shape,
      preset: normalizedPreset,
      capacity: targetCapacity,
      tableWidth,
      tableHeight,
    });

    setZoneState(createZoneSeatState(automatic.seatPlacements, tableWidth, tableHeight));
    setCornerBenchState(createCornerBenchState(automatic.cornerBenchConfigs, tableWidth, tableHeight));
  }, [layoutPreset, shape, targetCapacity, tableWidth, tableHeight]);

  const seatPlacements = useMemo(
    () => buildSeatPlacements(shape, zoneState),
    [shape, zoneState],
  );
  const cornerBenchConfigs = useMemo(
    () => buildCornerBenchConfigs(shape, cornerBenchState),
    [shape, cornerBenchState],
  );
  const configuredCapacity = useMemo(() => getConfiguredTableCapacity({
    shape,
    seatPlacements,
    cornerBenchConfigs,
  }), [shape, seatPlacements, cornerBenchConfigs]);

  const resolved = useMemo(() => getResolvedFloorPlanDimensions({
    capacity: targetCapacity,
    shape,
    seatType: getPrimarySeatType(seatPlacements, cornerBenchConfigs),
    seatPlacements,
    cornerBenchConfigs,
    tableWidth,
    tableHeight: shape === "round" ? tableWidth : tableHeight,
  }), [targetCapacity, shape, seatPlacements, cornerBenchConfigs, tableWidth, tableHeight]);

  const visibleZones = shape === "rect" ? RECT_SEAT_ZONES : ROUND_SEAT_ZONES;
  const activeZoneLabels = shape === "rect" ? RECT_SEAT_ZONE_LABELS : ROUND_SEAT_ZONE_LABELS;
  const availablePresets = shape === "round" ? ROUND_LAYOUT_PRESETS : RECT_LAYOUT_PRESETS;
  const canSubmit = configuredCapacity > 0;
  const presetCopy = LAYOUT_PRESET_COPY[layoutPreset];

  const handleShapeChange = (nextShape: FloorPlanTableShape) => {
    setShape(nextShape);
    if (nextShape === "round") {
      const diameter = Math.max(tableWidth, tableHeight);
      setTableWidth(diameter);
      setTableHeight(diameter);
    }
    setLayoutPreset((current) => normalizeLayoutPreset(nextShape, current));
  };

  const handleLayoutPresetChange = (nextPreset: TableLayoutPreset) => {
    const normalized = normalizeLayoutPreset(shape, nextPreset);
    setLayoutPreset(normalized);
    if (normalized === "custom") {
      setAdvancedOpen(true);
    }
    if ((normalized === "corner" || normalized === "bench-two-sides") && targetCapacity < 2) {
      setTargetCapacity(2);
    }
  };

  const enterManualMode = () => {
    setLayoutPreset("custom");
    setAdvancedOpen(true);
  };

  const updateZone = (zone: FloorPlanSeatZone, updater: (current: ZoneSeatState) => ZoneSeatState) => {
    enterManualMode();
    setZoneState((current) => ({
      ...current,
      [zone]: updater(current[zone]),
    }));
  };

  const updateCornerBench = (
    corner: FloorPlanCornerBenchCorner,
    updater: (current: CornerBenchState) => CornerBenchState,
  ) => {
    enterManualMode();
    setCornerBenchState((current) => ({
      ...current,
      [corner]: updater(current[corner]),
    }));
  };

  const submit = () => {
    if (!canSubmit) return;
    onConfirm({
      capacity: resolved.capacity,
      shape,
      seatType: getPrimarySeatType(resolved.seatPlacements, resolved.cornerBenchConfigs),
      seatPlacements: resolved.seatPlacements,
      cornerBenchConfigs: resolved.cornerBenchConfigs,
      tableWidth: resolved.tableWidth,
      tableHeight: resolved.tableHeight,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(96vh,980px)] w-[calc(100vw-1rem)] max-w-[1120px] overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,251,0.98))] p-0 shadow-[0_40px_120px_-52px_rgba(15,23,42,0.48)]">
        <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(272px,312px)_minmax(0,1fr)]">
          <div className="min-h-0 border-b border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(241,245,249,0.98))] lg:border-b-0 lg:border-r">
            <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 sm:p-6">
              <DialogHeader className="space-y-3 text-left">
                <DialogTitle className="flex items-center gap-2 text-xl text-slate-950">
                  <Armchair className="h-5 w-5 text-slate-600" />
                  {isEditing ? "Modifier la table" : "Configurer la table"}
                </DialogTitle>
                <DialogDescription className="max-w-sm text-sm leading-6 text-slate-500">
                  Commencez par la base, choisissez une disposition rapide, puis n'ouvrez les réglages fins que si c'est réellement utile.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-5 rounded-[28px] border border-white/80 bg-white/85 p-4 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)] sm:p-5">
                <div className="flex h-44 items-center justify-center rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(241,245,249,0.92))] sm:h-52">
                  <FloorPlanItemIllustration
                    kind="table"
                    shape={shape}
                    capacity={Math.max(0, resolved.capacity)}
                    seatType={getPrimarySeatType(resolved.seatPlacements, resolved.cornerBenchConfigs)}
                    seatPlacements={resolved.seatPlacements}
                    cornerBenchCorners={resolved.cornerBenchCorners}
                    cornerBenchConfigs={resolved.cornerBenchConfigs}
                    tableWidth={resolved.tableWidth}
                    tableHeight={resolved.tableHeight}
                    className="h-44 w-60"
                    decorative={false}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <Sparkles className="h-3.5 w-3.5" />
                      Disposition active
                    </div>
                    <p className="mt-2 text-base font-semibold text-slate-900">{presetCopy.label}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{presetCopy.description}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <Armchair className="h-3.5 w-3.5" />
                        Couverts
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{resolved.capacity}</p>
                      <p className="mt-1 text-sm text-slate-500">cible {targetCapacity}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <Ruler className="h-3.5 w-3.5" />
                        Plateau
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {resolved.tableWidth} x {resolved.tableHeight} cm
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <Footprints className="h-3.5 w-3.5" />
                        Emprise
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {resolved.footprintWidth} x {resolved.footprintHeight} cm
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="space-y-6">
                <div className="rounded-[26px] border border-slate-200 bg-white/80 p-4 sm:p-5">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">1. Base</p>
                    <p className="mt-1 text-sm text-slate-500">Choisissez la forme, la capacité cible et la taille du plateau. Le reste se recalcule autour.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-slate-700">Forme</Label>
                      <ToggleGroup
                        type="single"
                        value={shape}
                        onValueChange={(value) => value && handleShapeChange(value as FloorPlanTableShape)}
                        className="grid min-w-0 grid-cols-2 gap-2"
                      >
                        <ToggleGroupItem value="rect" className="h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium data-[state=on]:border-slate-900 data-[state=on]:bg-slate-900 data-[state=on]:text-white">
                          Rectangle
                        </ToggleGroupItem>
                        <ToggleGroupItem value="round" className="h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium data-[state=on]:border-slate-900 data-[state=on]:bg-slate-900 data-[state=on]:text-white">
                          Ronde
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>

                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                      <div className="min-w-0 space-y-2">
                        <Label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Capacité cible</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={targetCapacity}
                            onChange={(event) => setTargetCapacity(clampInput(Number(event.target.value), targetCapacity))}
                            className="h-11 min-w-0 rounded-2xl border-slate-200 bg-white pr-12 text-base font-semibold text-slate-900"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-slate-400">pl.</span>
                        </div>
                      </div>

                      {shape === "round" ? (
                        <DimensionInput
                          label="Diamètre"
                          value={tableWidth}
                          onChange={(value) => {
                            setTableWidth(value);
                            setTableHeight(value);
                          }}
                        />
                      ) : (
                        <>
                          <DimensionInput label="Largeur" value={tableWidth} onChange={setTableWidth} />
                          <DimensionInput label="Profondeur" value={tableHeight} onChange={setTableHeight} />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white/80 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">2. Disposition</p>
                      <p className="mt-1 text-sm text-slate-500">Choisissez un modèle rapide. Il génère automatiquement une configuration propre sans superposition.</p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-900">
                      {resolved.capacity} pl. calculées
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {availablePresets.map((presetOption) => (
                      <LayoutPresetCard
                        key={presetOption}
                        preset={presetOption}
                        active={layoutPreset === presetOption}
                        onClick={() => handleLayoutPresetChange(presetOption)}
                      />
                    ))}
                  </div>
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-[26px] border border-slate-200 bg-white/80">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">3. Affiner</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {layoutPreset === "custom"
                          ? "Vous êtes en mode manuel. Chaque modification s'applique directement aux zones actives."
                          : "Les réglages fins sont masqués par défaut. Ouvrez-les seulement si la disposition rapide ne suffit pas."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {layoutPreset !== "custom" ? (
                        <Button type="button" variant="outline" className="rounded-2xl" onClick={enterManualMode}>
                          Passer en manuel
                        </Button>
                      ) : null}
                      <CollapsibleTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-slate-600 hover:bg-slate-100">
                          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent className="border-t border-slate-200 px-4 py-4 sm:px-5">
                    <div className="space-y-5">
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-500">
                        Toute modification ici bascule automatiquement en mode manuel pour vous laisser le contrôle total, zone par zone.
                      </div>

                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Assises par zone</p>
                            <p className="text-xs text-slate-500">Activez uniquement les zones utiles pour garder un visuel propre et logique.</p>
                          </div>
                        </div>
                        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(248px,1fr))]">
                          {visibleZones.map((zone) => (
                            <ZoneSeatCard
                              key={zone}
                              label={activeZoneLabels[zone]}
                              state={zoneState[zone]}
                              onToggle={(checked) => updateZone(zone, (current) => ({ ...current, enabled: checked }))}
                              onTypeChange={(type) => updateZone(zone, (current) => ({ ...current, type }))}
                              onCountChange={(count) => updateZone(zone, (current) => ({ ...current, count }))}
                              onBenchLengthChange={(value) => updateZone(zone, (current) => ({ ...current, benchLength: value }))}
                              onBenchDepthChange={(value) => updateZone(zone, (current) => ({ ...current, benchDepth: value }))}
                            />
                          ))}
                        </div>
                      </div>

                      {shape === "rect" ? (
                        <div>
                          <div className="mb-3 flex items-center gap-2">
                            <Sofa className="h-4 w-4 text-amber-600" />
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Bancs d'angle</p>
                              <p className="text-xs text-slate-500">À activer seulement si vous composez une table murale ou un coin salon.</p>
                            </div>
                          </div>
                          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(248px,1fr))]">
                            {CORNER_BENCH_CORNERS.map((corner) => (
                              <CornerBenchCard
                                key={corner}
                                label={CORNER_BENCH_LABELS[corner]}
                                state={cornerBenchState[corner]}
                                onModeChange={(enabled) => updateCornerBench(corner, (current) => ({ ...current, enabled }))}
                                onHorizontalChange={(value) => updateCornerBench(corner, (current) => ({ ...current, horizontal: value }))}
                                onVerticalChange={(value) => updateCornerBench(corner, (current) => ({ ...current, vertical: value }))}
                                onDepthChange={(value) => updateCornerBench(corner, (current) => ({ ...current, depth: value }))}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {!canSubmit ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    Activez au moins une zone d'assise ou un banc d'angle avant d'ajouter la table.
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="text-sm text-slate-500">
                {layoutPreset === "custom" ? "Mode manuel actif" : `Auto: ${presetCopy.label.toLowerCase()}`}
              </div>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button variant="outline" className="h-11 rounded-2xl" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button className="h-11 rounded-2xl px-5" onClick={submit} disabled={!canSubmit}>
                  {isEditing ? "Appliquer" : "Ajouter"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
