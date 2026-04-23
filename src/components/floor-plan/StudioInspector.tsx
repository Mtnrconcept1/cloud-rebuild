import { Armchair, Copy, LayoutPanelTop, RotateCw, Ruler, Trash2 } from "lucide-react";

import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getFloorPlanItemTypeLabel } from "@/lib/floorPlan";
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
}: StudioInspectorProps) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] shadow-[0_24px_80px_-44px_rgba(15,23,42,0.4)]">
      <CardHeader className="space-y-3 border-b border-slate-200/80 pb-4">
        <div>
          <CardTitle className="text-xl text-slate-950">Inspecteur studio</CardTitle>
          <CardDescription className="mt-1 text-slate-500">
            Réglages utiles uniquement. Les options lourdes sont déplacées dans le configurateur.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto p-4">
        {!selectedTable ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
            <LayoutPanelTop className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700">Aucune sélection</p>
            <p className="mt-1 text-sm text-slate-500">
              Touchez un élément dans le canevas pour ajuster son nom, sa rotation, sa taille ou ouvrir son configurateur.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[26px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex h-48 items-center justify-center rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(241,245,249,0.98))]">
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
                  className="h-40 w-full max-w-[220px]"
                  decorative={false}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
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

            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={selectedTable.table_number} onChange={(event) => onRename(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Secteur</Label>
              <Select value={selectedTable.sector} onValueChange={onSectorChange}>
                <SelectTrigger className="min-w-0">
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

            {selectedTableIsReservable && selectedTableDimensions ? (
              <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <Ruler className="h-3.5 w-3.5" />
                  Dimensions
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Plateau</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {selectedTableDimensions.tableWidth} x {selectedTableDimensions.tableHeight} cm
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Emprise</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {selectedTableDimensions.footprintWidth} x {selectedTableDimensions.footprintHeight} cm
                    </p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="justify-start rounded-2xl" onClick={onConfigureTable}>
                  <Armchair className="mr-2 h-4 w-4" />
                  Configurer dimensions et assises
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <Ruler className="h-3.5 w-3.5" />
                  Taille du mobilier
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Largeur</Label>
                    <Input
                      type="number"
                      min={1}
                      value={Math.round(selectedTable.layout.w)}
                      onChange={(event) => onUpdateFurnitureWidth(clampDimension(Number(event.target.value), selectedTable.layout.w))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Profondeur</Label>
                    <Input
                      type="number"
                      min={1}
                      value={Math.round(selectedTable.layout.h)}
                      onChange={(event) => onUpdateFurnitureHeight(clampDimension(Number(event.target.value), selectedTable.layout.h))}
                    />
                  </div>
                </div>
                <p className="text-sm text-slate-500">
                  Le mobilier non-table garde un paramétrage minimal: taille, rotation, secteur et visibilité.
                </p>
              </div>
            )}

            <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="space-y-2">
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
                    className="w-[110px]"
                  />
                  <span className="text-xs text-slate-500">deg</span>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onRotateIncrement}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">Visible sur le plan</p>
                  <p className="text-sm text-slate-500">Désactivez un élément sans le supprimer définitivement.</p>
                </div>
                <Switch checked={selectedTable.is_active} onCheckedChange={onToggleActive} />
              </div>
            </div>

            <div className="grid gap-2">
              <Button type="button" variant="outline" className="justify-start rounded-2xl" onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Dupliquer
              </Button>
              <Button type="button" variant="outline" className="justify-start rounded-2xl text-destructive" onClick={onRemove}>
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
