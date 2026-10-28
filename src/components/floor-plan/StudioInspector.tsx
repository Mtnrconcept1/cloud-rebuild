import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Armchair,
  Copy,
  LayoutPanelTop,
  LockKeyhole,
  Minus,
  Move,
  Plus,
  RotateCw,
  Ruler,
  Settings2,
  Trash2,
} from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getFloorPlanItemResizeBehavior,
  getFloorPlanItemTypeLabel,
  getMinimumTableSize,
} from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

import type { StudioDraftTable } from "./studioShared";

type SelectedTableDimensions = {
  tableWidth: number;
  tableHeight: number;
  footprintWidth: number;
  footprintHeight: number;
};

type StudioInspectorProps = {
  selectedTable: StudioDraftTable | null;
  selectedTableIsReservable: boolean;
  selectedTableDimensions: SelectedTableDimensions | null;
  sectorOptions: string[];
  onRename: (value: string) => void;
  onSectorChange: (value: string) => void;
  onRotationChange: (value: number) => void;
  onRotateIncrement: () => void;
  onToggleActive: (checked: boolean) => void;
  onConfigureTable: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUpdateFurnitureWidth: (value: number) => void;
  onUpdateFurnitureHeight: (value: number) => void;
  onUpdateFurnitureSize: (width: number, height: number) => void;
  onPositionChange?: (x: number, y: number) => void;
  onLockedChange?: (locked: boolean) => void;
  onTableShapeChange?: (shape: "round" | "square" | "rect") => void;
  onCapacityChange?: (capacity: number) => void;
  onFinishChange?: (finish: "oak" | "natural" | "walnut") => void;
};

const INPUT_CLASS =
  "h-10 rounded-lg border-[#e3dbd1] bg-white text-sm shadow-none";
const TABLE_FORMS = [
  { value: "round", label: "Ronde", className: "h-4 w-4 rounded-full" },
  { value: "square", label: "Carrée", className: "h-4 w-4 rounded-[2px]" },
  { value: "rect", label: "Rectangulaire", className: "h-3 w-5 rounded-[2px]" },
] as const;
const TABLE_FINISHES = [
  { value: "oak", label: "Chêne clair", color: "#deb888" },
  { value: "natural", label: "Bois naturel", color: "#ceb894" },
  { value: "walnut", label: "Noyer", color: "#88613e" },
] as const;

function InspectorSection({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-[#eee7df] pt-4">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#3f352d]">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function MeasurementInput({
  label,
  value,
  onCommit,
  disabled = false,
  minimum = 0,
  step = 1,
  unit = "u.",
}: {
  label: string;
  value: number;
  onCommit?: (value: number) => void;
  disabled?: boolean;
  minimum?: number;
  step?: number;
  unit?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(String(Math.round(value)));
      return;
    }
    const next = Math.max(minimum, Math.round(parsed));
    setDraft(String(next));
    if (next !== Math.round(value)) onCommit?.(next);
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-[#84776c]">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={minimum}
          step={step}
          value={draft}
          readOnly={!onCommit}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(String(Math.round(value)));
            }
          }}
          className={cn(
            INPUT_CLASS,
            "pr-8",
            !onCommit && "bg-[#f8f5f0] text-[#776c62]",
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#a39587]"
        >
          {unit}
        </span>
      </div>
    </div>
  );
}

export default function StudioInspector({
  selectedTable,
  selectedTableIsReservable,
  selectedTableDimensions,
  sectorOptions,
  onRename,
  onSectorChange,
  onRotationChange,
  onRotateIncrement,
  onToggleActive,
  onConfigureTable,
  onDuplicate,
  onRemove,
  onUpdateFurnitureWidth,
  onUpdateFurnitureHeight,
  onUpdateFurnitureSize,
  onPositionChange,
  onLockedChange,
  onTableShapeChange,
  onCapacityChange,
  onFinishChange,
}: StudioInspectorProps) {
  const inputId = useId();
  const furnitureMinimum =
    selectedTable && !selectedTableIsReservable
      ? getMinimumTableSize(
          selectedTable.capacity,
          selectedTable.layout.shape,
          selectedTable.layout.kind,
        )
      : null;
  const resizeBehavior = selectedTable
    ? getFloorPlanItemResizeBehavior(
        selectedTable.layout.kind,
        selectedTable.layout.shape,
      )
    : null;
  const locked = selectedTable?.layout.locked === true;

  if (!selectedTable) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-dashed border-[#e3dbd1] bg-[#fbf9f5] px-6 py-10 text-center">
        <div>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[#e8e1d8] bg-white">
            <LayoutPanelTop
              className="h-5 w-5 text-[#aa9a8a]"
              aria-hidden="true"
            />
          </span>
          <h2 className="mt-4 font-display text-xl text-[#43382e]">
            Choisissez un élément
          </h2>
          <p className="mx-auto mt-2 max-w-[220px] text-sm leading-relaxed text-[#8b7f74]">
            Sélectionnez une table ou un meuble sur le plan pour ajuster ses
            réglages.
          </p>
        </div>
      </div>
    );
  }

  const table = selectedTable;
  const itemType = getFloorPlanItemTypeLabel(
    table.layout.kind,
    table.layout.shape,
  );
  const selectedForm =
    table.layout.shape === "round"
      ? "round"
      : Math.abs(
            (selectedTableDimensions?.tableWidth ?? table.layout.w) -
              (selectedTableDimensions?.tableHeight ?? table.layout.h),
          ) < 1
        ? "square"
        : "rect";

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-floor-plan-inspector
    >
      <header className="flex shrink-0 items-center gap-3 pb-4">
        <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-xl border border-[#eee7df] bg-[#f7f3ec] p-1.5">
          <FloorPlanItemIllustration
            kind={table.layout.kind}
            shape={table.layout.shape}
            visualVariant={table.layout.visualVariant}
            finish={table.layout.finish}
            capacity={table.capacity > 0 ? table.capacity : undefined}
            seatType={table.layout.seatType}
            seatPlacements={table.layout.seatPlacements}
            cornerBenchCorners={table.layout.cornerBenchCorners}
            cornerBenchConfigs={table.layout.cornerBenchConfigs}
            tableWidth={table.layout.tableWidth}
            tableHeight={table.layout.tableHeight}
            cornerBenchHorizontal={table.layout.cornerBenchHorizontal}
            cornerBenchVertical={table.layout.cornerBenchVertical}
            cornerBenchDepth={table.layout.cornerBenchDepth}
            className="h-full w-full"
            decorative
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-display text-[23px] leading-tight text-[#302b27]">
            {table.table_number || itemType}
          </h2>
          <p className="mt-1.5 truncate text-xs text-[#8b7f74]">
            {table.sector}
          </p>
          <p className="mt-1 text-xs text-[#8b7f74]">
            {itemType}
            {selectedTableIsReservable ? ` · ${table.capacity} places` : ""}
          </p>
        </div>
        {locked ? (
          <LockKeyhole
            className="h-4 w-4 shrink-0 text-primary"
            aria-label="Position verrouillée"
          />
        ) : null}
      </header>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3 pr-1"
        key={table.id}
      >
        <InspectorSection title="Identification">
          <div className="space-y-1.5">
            <Label
              htmlFor={`${inputId}-name`}
              className="text-xs font-normal text-[#84776c]"
            >
              {selectedTableIsReservable
                ? "Nom ou numéro de table"
                : "Nom de l’élément"}
            </Label>
            <Input
              id={`${inputId}-name`}
              className={INPUT_CLASS}
              value={table.table_number}
              onChange={(event) => onRename(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`${inputId}-sector`}
              className="text-xs font-normal text-[#84776c]"
            >
              Secteur
            </Label>
            <Select value={table.sector} onValueChange={onSectorChange}>
              <SelectTrigger
                id={`${inputId}-sector`}
                className={cn(INPUT_CLASS, "min-w-0")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sectorOptions.map((sector) => (
                  <SelectItem key={sector} value={sector}>
                    {sector}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </InspectorSection>

        {selectedTableIsReservable ? (
          <InspectorSection
            title="Configuration"
            icon={
              <Armchair
                className="h-3.5 w-3.5 text-[#9c8c7c]"
                aria-hidden="true"
              />
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[#84776c]">Forme</p>
                {onTableShapeChange ? (
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {TABLE_FORMS.map((form) => (
                      <button
                        key={form.value}
                        type="button"
                        aria-label={`Forme ${form.label.toLocaleLowerCase("fr")}`}
                        aria-pressed={selectedForm === form.value}
                        disabled={locked}
                        onClick={() => onTableShapeChange(form.value)}
                        className={cn(
                          "grid h-10 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45",
                          selectedForm === form.value
                            ? "border-primary bg-[#fff5ec] text-primary"
                            : "border-[#e3dbd1] bg-[#faf7f3] text-[#76685a] hover:bg-white",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "border-[1.5px] border-current",
                            form.className,
                          )}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[#433a33]">
                    <span
                      className={cn(
                        "h-4 w-4 border-[1.5px] border-primary",
                        table.layout.shape === "round"
                          ? "rounded-full"
                          : "rounded-[3px]",
                      )}
                      aria-hidden="true"
                    />
                    {
                      TABLE_FORMS.find((form) => form.value === selectedForm)
                        ?.label
                    }
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-[#84776c]">Capacité</p>
                {onCapacityChange ? (
                  <div className="mt-2 flex h-10 items-stretch overflow-hidden rounded-lg border border-[#e3dbd1] bg-white">
                    <button
                      type="button"
                      aria-label="Réduire la capacité"
                      disabled={locked || table.capacity <= 1}
                      onClick={() =>
                        onCapacityChange(Math.max(1, table.capacity - 1))
                      }
                      className="grid w-8 shrink-0 place-items-center hover:bg-[#faf7f3] disabled:opacity-35"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className="flex min-w-0 flex-1 items-center justify-center border-x border-[#eee7df] px-1 text-xs font-medium"
                      aria-live="polite"
                    >
                      {table.capacity} places
                    </span>
                    <button
                      type="button"
                      aria-label="Augmenter la capacité"
                      disabled={locked || table.capacity >= 32}
                      onClick={() =>
                        onCapacityChange(Math.min(32, table.capacity + 1))
                      }
                      className="grid w-8 shrink-0 place-items-center hover:bg-[#faf7f3] disabled:opacity-35"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm font-medium text-[#433a33]">
                    {table.capacity} places
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full gap-2 rounded-lg border-[#e3dbd1] bg-white text-xs"
              onClick={onConfigureTable}
              disabled={locked}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configurer la table et les assises
            </Button>
          </InspectorSection>
        ) : null}

        <InspectorSection
          title="Dimensions et position"
          icon={
            <Ruler className="h-3.5 w-3.5 text-[#9c8c7c]" aria-hidden="true" />
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {selectedTableIsReservable ? (
              <>
                <MeasurementInput
                  label={
                    table.layout.shape === "round"
                      ? "Diamètre du plateau"
                      : "Largeur du plateau"
                  }
                  value={selectedTableDimensions?.tableWidth ?? table.layout.w}
                />
                <MeasurementInput
                  label="Profondeur du plateau"
                  value={selectedTableDimensions?.tableHeight ?? table.layout.h}
                />
              </>
            ) : (
              <>
                <MeasurementInput
                  label="Largeur"
                  value={table.layout.w}
                  minimum={1}
                  disabled={locked}
                  onCommit={(nextW) => {
                    if (resizeBehavior?.ratioLocked && table.layout.w > 0)
                      onUpdateFurnitureSize(
                        nextW,
                        Math.max(
                          1,
                          Math.round((nextW * table.layout.h) / table.layout.w),
                        ),
                      );
                    else onUpdateFurnitureWidth(nextW);
                  }}
                />
                <MeasurementInput
                  label="Profondeur"
                  value={table.layout.h}
                  minimum={1}
                  disabled={locked}
                  onCommit={(nextH) => {
                    if (resizeBehavior?.ratioLocked && table.layout.h > 0)
                      onUpdateFurnitureSize(
                        Math.max(
                          1,
                          Math.round((nextH * table.layout.w) / table.layout.h),
                        ),
                        nextH,
                      );
                    else onUpdateFurnitureHeight(nextH);
                  }}
                />
              </>
            )}
            <MeasurementInput
              label="Position X"
              value={table.layout.x}
              disabled={locked}
              onCommit={
                onPositionChange
                  ? (x) => onPositionChange(x, table.layout.y)
                  : undefined
              }
            />
            <MeasurementInput
              label="Position Y"
              value={table.layout.y}
              disabled={locked}
              onCommit={
                onPositionChange
                  ? (y) => onPositionChange(table.layout.x, y)
                  : undefined
              }
            />
          </div>
          <p className="text-[11px] leading-relaxed text-[#9b8c7e]">
            Dimensions en unités du plan.
            {selectedTableIsReservable
              ? " Le configurateur ajuste le plateau et les assises ensemble."
              : resizeBehavior?.ratioLocked
                ? " Les proportions sont conservées."
                : " Ajustez chaque dimension librement."}
          </p>
          {furnitureMinimum ? (
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg text-xs"
                disabled={locked}
                onClick={() =>
                  onUpdateFurnitureSize(furnitureMinimum.w, furnitureMinimum.h)
                }
              >
                Minimum
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg text-xs"
                disabled={locked}
                onClick={() =>
                  onUpdateFurnitureSize(
                    Math.max(
                      furnitureMinimum.w,
                      Math.round(table.layout.w * 0.75),
                    ),
                    Math.max(
                      furnitureMinimum.h,
                      Math.round(table.layout.h * 0.75),
                    ),
                  )
                }
              >
                −25 %
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg text-xs"
                disabled={locked}
                onClick={() =>
                  onUpdateFurnitureSize(
                    Math.round(table.layout.w * 1.25),
                    Math.round(table.layout.h * 1.25),
                  )
                }
              >
                +25 %
              </Button>
            </div>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)_42px] items-end gap-2">
            <MeasurementInput
              label="Rotation"
              value={table.layout.rotation}
              minimum={-360}
              step={15}
              unit="°"
              disabled={locked}
              onCommit={(value) =>
                onRotationChange(((value % 360) + 360) % 360)
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg border-[#e3dbd1]"
              onClick={onRotateIncrement}
              disabled={locked}
              aria-label="Faire pivoter de 45 degrés"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>
        </InspectorSection>

        {selectedTableIsReservable && onFinishChange ? (
          <InspectorSection title="Apparence">
            <Label
              htmlFor={`${inputId}-finish`}
              className="text-xs font-normal text-[#84776c]"
            >
              Finition du plateau
            </Label>
            <div className="flex items-center gap-2.5">
              <Select
                value={table.layout.finish || "oak"}
                onValueChange={(value) =>
                  onFinishChange(value as "oak" | "natural" | "walnut")
                }
                disabled={locked}
              >
                <SelectTrigger
                  id={`${inputId}-finish`}
                  className={cn(INPUT_CLASS, "min-w-0 flex-1")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TABLE_FINISHES.map((finish) => (
                    <SelectItem key={finish.value} value={finish.value}>
                      {finish.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex shrink-0 items-center gap-1.5">
                {TABLE_FINISHES.map((finish) => (
                  <button
                    key={finish.value}
                    type="button"
                    aria-label={`Finition : ${finish.label}`}
                    aria-pressed={
                      (table.layout.finish || "oak") === finish.value
                    }
                    disabled={locked}
                    onClick={() => onFinishChange(finish.value)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 border-white ring-1 ring-[#e3dbd1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40",
                      (table.layout.finish || "oak") === finish.value &&
                        "ring-2 ring-primary",
                    )}
                    style={{
                      backgroundColor: finish.color,
                      backgroundImage:
                        "repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(255,255,255,.15) 4px,transparent 5px)",
                    }}
                  />
                ))}
              </div>
            </div>
          </InspectorSection>
        ) : null}

        <InspectorSection title="Options">
          <div className="flex items-center justify-between gap-3">
            <Label
              htmlFor={`${inputId}-active`}
              className="min-w-0 text-xs font-normal text-[#66594d]"
            >
              {selectedTableIsReservable
                ? "Table active"
                : "Visible sur le plan"}
            </Label>
            <Switch
              id={`${inputId}-active`}
              checked={table.is_active}
              onCheckedChange={onToggleActive}
            />
          </div>
          {onLockedChange ? (
            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor={`${inputId}-lock`}
                className="flex min-w-0 items-center gap-2 text-xs font-normal text-[#66594d]"
              >
                <LockKeyhole
                  className="h-3.5 w-3.5 text-[#9c8c7c]"
                  aria-hidden="true"
                />
                Verrouiller la position
              </Label>
              <Switch
                id={`${inputId}-lock`}
                checked={locked}
                onCheckedChange={onLockedChange}
              />
            </div>
          ) : null}
          {locked ? (
            <p className="flex items-start gap-2 rounded-lg bg-[#f7f2ea] p-2.5 text-[11px] leading-relaxed text-[#8a7661]">
              <Move
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              Déverrouillez l’élément pour modifier sa position, ses dimensions
              ou le supprimer.
            </p>
          ) : null}
        </InspectorSection>
      </div>

      <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#e8e1d8] pt-3">
        <Button
          type="button"
          variant="ghost"
          className="h-10 gap-2 rounded-lg text-xs text-[#51453a]"
          onClick={onDuplicate}
        >
          <Copy className="h-4 w-4" />
          Dupliquer
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 gap-2 rounded-lg text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={onRemove}
          disabled={locked}
        >
          <Trash2 className="h-4 w-4" />
          Supprimer
        </Button>
      </footer>
    </div>
  );
}
