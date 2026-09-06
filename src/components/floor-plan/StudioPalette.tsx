import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutPanelTop, Search, Sparkles, Wand2 } from "lucide-react";

import FloorPlanAIPanel, { type AIFloorPlanResult } from "@/components/floor-plan/FloorPlanAIPanel";
import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FloorPlanTablePreset } from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

import {
  FLOOR_PLAN_PREVIEW_TILE_NEUTRAL_CLASS,
  FLOOR_PLAN_PREVIEW_TILE_PLANT_CLASS,
  FLOOR_PLAN_PREVIEW_TILE_TABLE_CLASS,
} from "./floorPlanSheet";
import type { StudioDraftTable, StudioLibraryTab } from "./studioShared";

type StudioPaletteProps = {
  selectedId: string | null;
  selectedSector: string;
  sectorOptions: string[];
  libraryTab: StudioLibraryTab;
  libraryQuery: string;
  canvasWidth: number;
  canvasHeight: number;
  draftTables: StudioDraftTable[];
  tablesLoading: boolean;
  newSectorName: string;
  onLibraryTabChange: (value: StudioLibraryTab) => void;
  onLibraryQueryChange: (value: string) => void;
  onPresetClick: (presetId: string) => void;
  onSectorSelect: (value: string) => void;
  onNewSectorNameChange: (value: string) => void;
  onAddSector: () => void;
  onApplyAILayout: (layout: AIFloorPlanResult) => void;
  presetsByTab: Record<StudioLibraryTab, FloorPlanTablePreset[]>;
};

function StudioPresetCard({
  preset,
  onClick,
  disabled,
}: {
  preset: FloorPlanTablePreset;
  onClick: () => void;
  disabled: boolean;
}) {
  const meta = preset.capacity ? `${preset.capacity} pl.` : null;
  // Vignette de prévisualisation : fond clair dans les deux thèmes, comme le
  // canevas, parce qu'on y rend le même mobilier à couleurs figées.
  const tone = preset.category === "table"
    ? FLOOR_PLAN_PREVIEW_TILE_TABLE_CLASS
    : preset.kind === "plant"
      ? FLOOR_PLAN_PREVIEW_TILE_PLANT_CLASS
      : FLOOR_PLAN_PREVIEW_TILE_NEUTRAL_CLASS;

  return (
    <button
      type="button"
      className="h-auto min-w-0 touch-manipulation whitespace-normal rounded-2xl border border-border bg-card px-3 py-3 text-left shadow-sm transition hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Ajouter ${preset.label}${meta ? `, ${meta}` : ""}`}
    >
      <div className="w-full min-w-0 space-y-3">
        <div className={cn("flex h-24 items-center justify-center overflow-hidden rounded-xl border px-3 py-2 shadow-inner", tone)}>
          <FloorPlanItemIllustration
            kind={preset.kind}
            shape={preset.shape}
            capacity={preset.capacity > 0 ? preset.capacity : undefined}
            className="block h-full w-full"
            decorative={false}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-foreground">
              {preset.label}
            </span>
            {meta ? (
              <Badge variant="outline" className="shrink-0 rounded-full border-border bg-muted text-muted-foreground">
                {meta}
              </Badge>
            ) : null}
          </div>
          <p className="break-words text-xs leading-5 text-muted-foreground">{preset.description}</p>
        </div>
      </div>
    </button>
  );
}

export default function StudioPalette({
  selectedId,
  selectedSector,
  sectorOptions,
  libraryTab,
  libraryQuery,
  canvasWidth,
  canvasHeight,
  draftTables,
  tablesLoading,
  newSectorName,
  onLibraryTabChange,
  onLibraryQueryChange,
  onPresetClick,
  onSectorSelect,
  onNewSectorNameChange,
  onAddSector,
  onApplyAILayout,
  presetsByTab,
}: StudioPaletteProps) {
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const activePresets = presetsByTab[libraryTab];
  const totalElements = useMemo(() => draftTables.filter((table) => table.sector === selectedSector).length, [draftTables, selectedSector]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-3 border-b border-border/70 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Bibliothèque</h2>
            <p className="mt-1 text-xs text-muted-foreground">Objets prêts à poser sur le canevas.</p>
          </div>
          <Badge variant="outline" className="rounded-full border-border bg-card text-muted-foreground">
            {totalElements} elem.
          </Badge>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={libraryQuery}
            onChange={(event) => onLibraryQueryChange(event.target.value)}
            placeholder="Rechercher un preset..."
            className="h-10 rounded-xl border-border bg-card pl-9"
          />
        </div>

        <Tabs value={libraryTab} onValueChange={(value) => onLibraryTabChange(value as StudioLibraryTab)}>
          <TabsList className="grid h-auto grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <TabsTrigger value="tables" className="rounded-lg px-2 py-2 text-xs font-semibold">Tables</TabsTrigger>
            <TabsTrigger value="seating" className="rounded-lg px-2 py-2 text-xs font-semibold">Assises</TabsTrigger>
            <TabsTrigger value="structure" className="rounded-lg px-2 py-2 text-xs font-semibold">Structure</TabsTrigger>
            <TabsTrigger value="decor" className="rounded-lg px-2 py-2 text-xs font-semibold">Décor</TabsTrigger>
            <TabsTrigger value="event" className="col-span-2 rounded-lg px-2 py-2 text-xs font-semibold">Événementiel</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-3 py-3">
            <div className="rounded-xl border border-border bg-muted px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Secteur actif</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedSector}</p>
            </div>

            {activePresets.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                {activePresets.map((preset) => (
                  <StudioPresetCard
                    key={preset.id}
                    preset={preset}
                    onClick={() => onPresetClick(preset.id)}
                    disabled={tablesLoading}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-8 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">Aucun preset dans cette famille</p>
                <p className="mt-1 text-sm text-muted-foreground">Essayez une autre famille ou une recherche moins précise.</p>
              </div>
            )}

            <Collapsible open={sectorsOpen} onOpenChange={setSectorsOpen} className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Secteurs</p>
                  <p className="text-xs text-muted-foreground">Créer ou changer de zone.</p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted">
                    {sectorsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="border-t border-border px-4 py-4">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {sectorOptions.map((sector) => (
                      <Button
                        key={sector}
                        type="button"
                        variant={sector === selectedSector ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => onSectorSelect(sector)}
                      >
                        {sector}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studio-new-sector" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Nouveau secteur</Label>
                    <div className="flex gap-2">
                      <Input
                        id="studio-new-sector"
                        value={newSectorName}
                        onChange={(event) => onNewSectorNameChange(event.target.value)}
                        placeholder="Terrasse, salon privé..."
                        className="h-10 rounded-xl border-border bg-muted"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onAddSector();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" className="h-10 rounded-xl border-border bg-card" onClick={onAddSector}>
                        Ajouter
                      </Button>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {selectedId ? (
              <Collapsible open={aiOpen} onOpenChange={setAiOpen} className="rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Assistant IA</p>
                    <p className="text-xs text-muted-foreground">Pour amorcer une salle.</p>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted">
                      {aiOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="border-t border-border p-2">
                  <div className="rounded-[20px] border border-border bg-muted/50 p-1">
                    <FloorPlanAIPanel
                      restaurantId={selectedId}
                      currentLayout={draftTables.map((table) => ({
                        table_number: table.table_number,
                        capacity: table.capacity,
                        layout: {
                          x: table.layout.x,
                          y: table.layout.y,
                          w: table.layout.w,
                          h: table.layout.h,
                          shape: table.layout.shape,
                          kind: table.layout.kind,
                        },
                      }))}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                      onApply={onApplyAILayout}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className="rounded-2xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Wand2 className="h-4 w-4" />
                <span className="font-medium">Ajout rapide</span>
              </div>
              <p className="mt-2">
                Un tap ajoute le preset dans le secteur actif. Le configurateur n'apparaît que pour les vraies tables.
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
