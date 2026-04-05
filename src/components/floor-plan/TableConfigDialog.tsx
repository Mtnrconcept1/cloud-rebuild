import { useEffect, useMemo, useState } from "react";
import { Armchair, Footprints, Ruler, Sofa } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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

const LINEAR_SEAT_OPTIONS: FloorPlanLinearSeatType[] = ["chair", "stool", "bench"];
const ALL_ZONES: FloorPlanSeatZone[] = [...RECT_SEAT_ZONES, ...ROUND_SEAT_ZONES];

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
    <div className={`min-w-0 overflow-hidden rounded-[22px] border p-4 transition ${state.enabled ? "border-slate-900 bg-slate-950/[0.03]" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-slate-900">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Une seule famille d'assise par zone, pour eviter toute superposition.</p>
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
    <div className={`min-w-0 overflow-hidden rounded-[22px] border p-4 transition ${state.enabled ? "border-amber-400 bg-white" : "border-amber-200/80 bg-white/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-slate-900">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Chaque coin peut recevoir un banc d'angle dimensionne independamment.</p>
        </div>
        <Sofa className={`h-4 w-4 ${state.enabled ? "text-amber-600" : "text-slate-300"}`} />
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
          <DimensionInput label="Cote principal" value={state.horizontal} onChange={onHorizontalChange} />
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
    setShape(defaults.shape);
    setTableWidth(defaults.tableWidth);
    setTableHeight(defaults.tableHeight);
    setZoneState(createZoneSeatState(defaults.seatPlacements, defaults.tableWidth, defaults.tableHeight));
    setCornerBenchState(createCornerBenchState(defaults.cornerBenchConfigs, defaults.tableWidth, defaults.tableHeight));
  }, [defaults, open]);

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
    capacity: configuredCapacity,
    shape,
    seatType: getPrimarySeatType(seatPlacements, cornerBenchConfigs),
    seatPlacements,
    cornerBenchConfigs,
    tableWidth: shape === "round" ? tableWidth : tableWidth,
    tableHeight: shape === "round" ? tableWidth : tableHeight,
  }), [
    configuredCapacity,
    shape,
    seatPlacements,
    cornerBenchConfigs,
    tableWidth,
    tableHeight,
  ]);

  const visibleZones = shape === "rect" ? RECT_SEAT_ZONES : ROUND_SEAT_ZONES;
  const activeZoneLabels = shape === "rect" ? RECT_SEAT_ZONE_LABELS : ROUND_SEAT_ZONE_LABELS;
  const canSubmit = configuredCapacity > 0;

  const handleShapeChange = (nextShape: FloorPlanTableShape) => {
    setShape(nextShape);
    if (nextShape === "round") {
      const diameter = Math.max(tableWidth, tableHeight);
      setTableWidth(diameter);
      setTableHeight(diameter);
    }
  };

  const updateZone = (zone: FloorPlanSeatZone, updater: (current: ZoneSeatState) => ZoneSeatState) => {
    setZoneState((current) => ({
      ...current,
      [zone]: updater(current[zone]),
    }));
  };

  const updateCornerBench = (
    corner: FloorPlanCornerBenchCorner,
    updater: (current: CornerBenchState) => CornerBenchState,
  ) => {
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
      <DialogContent className="max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-[1080px] overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,251,0.98))] p-0 shadow-[0_40px_120px_-52px_rgba(15,23,42,0.48)]">
        <div className="grid min-h-0 gap-0 lg:grid-cols-[minmax(272px,300px)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(241,245,249,0.98))] p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl text-slate-950">
                <Armchair className="h-5 w-5 text-slate-600" />
                {isEditing ? "Modifier la table" : "Configurer la table"}
              </DialogTitle>
              <DialogDescription className="max-w-sm text-sm leading-6 text-slate-500">
                Composez les assises cote par cote et coin par coin, sans chevauchement entre les elements.
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

              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Armchair className="h-3.5 w-3.5" />
                    Capacite configuree
                  </div>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{resolved.capacity} couverts</p>
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
                    Emprise totale
                  </div>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {resolved.footprintWidth} x {resolved.footprintHeight} cm
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-6">
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

              <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Dimensions du plateau</p>
                  <p className="text-xs text-slate-500">Le moteur reserve ensuite automatiquement la place utile pour chaque assise autour.</p>
                </div>

                <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  {shape === "round" ? (
                    <DimensionInput
                      label="Diametre"
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

              <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Assises par zone</p>
                    <p className="text-xs text-slate-500">
                      Une zone ne peut contenir qu'une seule famille d'assise a la fois pour eviter toute superposition.
                    </p>
                  </div>
                  <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-900">
                    {resolved.capacity} pl.
                  </div>
                </div>

                <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(248px,1fr))]">
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
                <div className="rounded-[24px] border border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,251,235,0.9),rgba(255,247,237,0.92))] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">Bancs d'angle</p>
                      <p className="text-xs text-slate-500">
                        Chaque coin est gere separement et apparait comme un vrai element a configurer dans sa liste deroulante.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-sm font-semibold text-slate-900">
                      <Sofa className="h-4 w-4 text-amber-600" />
                      {cornerBenchConfigs.length} actif(s)
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(248px,1fr))]">
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

              {!canSubmit ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Activez au moins une zone d'assise ou un banc d'angle avant d'ajouter la table.
                </div>
              ) : null}
            </div>

            <DialogFooter className="mt-8 flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row">
              <Button variant="outline" className="h-11 w-full rounded-2xl sm:w-auto" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button className="h-11 w-full rounded-2xl px-5 sm:w-auto" onClick={submit} disabled={!canSubmit}>
                {isEditing ? "Appliquer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
