import { Armchair, Copy, LayoutPanelTop, RotateCw, Ruler, Trash2 } from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getFloorPlanItemResizeBehavior, getFloorPlanItemTypeLabel, getMinimumTableSize } from "@/lib/floorPlan";
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
};

function clampDimension(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : fallback;
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
}: StudioInspectorProps) {
  const furnitureMinimum = selectedTable && !selectedTableIsReservable
    ? getMinimumTableSize(selectedTable.capacity, selectedTable.layout.shape, selectedTable.layout.kind)
    : null;

  const resizeBehavior = selectedTable
    ? getFloorPlanItemResizeBehavior(selectedTable.layout.kind, selectedTable.layout.shape)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-2 border-b border-slate-200/80 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Réglages</h2>
          <p className="mt-1 text-xs text-slate-500">Nom, secteur, rotation et taille.</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {!selectedTable ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <LayoutPanelTop className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700">Aucune sélection</p>
            <p className="mt-1 text-xs text-slate-500">Touchez un élément du canevas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <div className="flex h-28 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                <FloorPlanItemIllustration
                  kind={selectedTable.layout.kind}
                  shape={selectedTable.layout.shape}
                  capacity={selectedTable.capacity > 0 ? selectedTable.capacity : undefined}
                  seatType={selectedTable.layout.seatType}
                  seatPlacements={selectedTable.layout.seatPlacements}
                  cornerBenchCorners={selectedTable.layout.cornerBenchCorners}
                  cornerBenchConfigs={selectedTable.layout.cornerBenchConfigs}
                  tableWidth={selectedTable.layout.tableWidth}
                  tableHeight={selectedTable.layout.tableHeight}
                  cornerBenchHorizontal={selectedTable.layout.cornerBenchHorizontal}
                  cornerBenchVertical={selectedTable.layout.cornerBenchVertical}
                  cornerBenchDepth={selectedTable.layout.cornerBenchDepth}
                  className="h-24 w-full max-w-[180px]"
                  decorative={false}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-700">
                  {getFloorPlanItemTypeLabel(selectedTable.layout.kind, selectedTable.layout.shape)}
                </Badge>
                {selectedTableIsReservable ? (
                  <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-700">
                    {selectedTable.capacity} couverts
                  </Badge>
                ) : null}
                <Badge variant="outline" className={cn(
                  "rounded-full",
                  selectedTable.is_active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500",
                )}>
                  {selectedTable.is_active ? "Actif" : "Masqué"}
                </Badge>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input className="h-10 rounded-xl" value={selectedTable.table_number} onChange={(event) => onRename(event.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Secteur</Label>
              <Select value={selectedTable.sector} onValueChange={onSectorChange}>
                <SelectTrigger className="h-10 min-w-0 rounded-xl">
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

            {selectedTableIsReservable ? (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <Armchair className="h-3.5 w-3.5" />
                  Assises
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Capacité</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedTable.capacity} couverts</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Zones</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {(selectedTable.layout.seatPlacements?.length || 0) + (selectedTable.layout.cornerBenchConfigs?.length || 0)} actives
                    </p>
                  </div>
                </div>
                {selectedTableDimensions ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Empreinte {Math.round(selectedTableDimensions.footprintWidth)} x {Math.round(selectedTableDimensions.footprintHeight)} px
                    {" - "}
                    plateau {Math.round(selectedTableDimensions.tableWidth)} x {Math.round(selectedTableDimensions.tableHeight)} px
                  </div>
                ) : null}
                <Button type="button" variant="outline" className="justify-start rounded-xl" onClick={onConfigureTable}>
                  <Armchair className="mr-2 h-4 w-4" />
                  Configurer les assises
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <Ruler className="h-3.5 w-3.5" />
                  Taille du mobilier
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Largeur</Label>
                    <Input
                      className="h-10 rounded-xl"
                      type="number"
                      min={1}
                      step={1}
                      value={Math.round(selectedTable.layout.w)}
                      onChange={(event) => {
                        const nextW = clampDimension(Number(event.target.value), selectedTable.layout.w);
                        if (resizeBehavior?.ratioLocked && selectedTable.layout.w > 0) {
                          const ratio = selectedTable.layout.h / selectedTable.layout.w;
                          onUpdateFurnitureSize(nextW, Math.max(1, Math.round(nextW * ratio)));
                        } else {
                          onUpdateFurnitureWidth(nextW);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Profondeur</Label>
                    <Input
                      className="h-10 rounded-xl"
                      type="number"
                      min={1}
                      step={1}
                      value={Math.round(selectedTable.layout.h)}
                      onChange={(event) => {
                        const nextH = clampDimension(Number(event.target.value), selectedTable.layout.h);
                        if (resizeBehavior?.ratioLocked && selectedTable.layout.h > 0) {
                          const ratio = selectedTable.layout.w / selectedTable.layout.h;
                          onUpdateFurnitureSize(Math.max(1, Math.round(nextH * ratio)), nextH);
                        } else {
                          onUpdateFurnitureHeight(nextH);
                        }
                      }}
                    />
                  </div>
                </div>
                {furnitureMinimum ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => onUpdateFurnitureSize(furnitureMinimum.w, furnitureMinimum.h)}
                    >
                      Mini
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => onUpdateFurnitureSize(
                        Math.max(furnitureMinimum.w, Math.round(selectedTable.layout.w * 0.75)),
                        Math.max(furnitureMinimum.h, Math.round(selectedTable.layout.h * 0.75)),
                      )}
                    >
                      -25%
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => onUpdateFurnitureSize(
                        Math.round(selectedTable.layout.w * 1.25),
                        Math.round(selectedTable.layout.h * 1.25),
                      )}
                    >
                      +25%
                    </Button>
                  </div>
                ) : null}
                <p className="text-sm text-slate-500">
                  {resizeBehavior?.ratioLocked
                    ? "Proportions verrouillées — le ratio est maintenu automatiquement."
                    : "Redimensionnement libre. Les petits objets restent manipulables directement sur le plan."}
                </p>
              </div>
            )}

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="space-y-1.5">
                <Label>Rotation</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={359}
                    step={15}
                    value={Math.round(selectedTable.layout.rotation)}
                    onChange={(event) => {
                      const raw = Math.round(Number(event.target.value) || 0) % 360;
                      onRotationChange(raw < 0 ? raw + 360 : raw);
                    }}
                    className="h-10 w-[110px] rounded-xl"
                  />
                  <span className="text-xs text-slate-500">deg</span>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onRotateIncrement}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">Visible sur le plan</p>
                  <p className="text-sm text-slate-500">Désactivez un élément sans le supprimer définitivement.</p>
                </div>
                <Switch checked={selectedTable.is_active} onCheckedChange={onToggleActive} />
              </div>
            </div>

            <div className="grid gap-2">
              <Button type="button" variant="outline" className="justify-start rounded-xl" onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Dupliquer
              </Button>
              <Button type="button" variant="outline" className="justify-start rounded-xl text-destructive" onClick={onRemove}>
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
