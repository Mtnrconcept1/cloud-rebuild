import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutPanelTop, Search, Sparkles, Wand2 } from "lucide-react";

import FloorPlanAIPanel, { type AIFloorPlanResult } from "@/components/floor-plan/FloorPlanAIPanel";
import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FloorPlanTablePreset } from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

import type { StudioDraftTable, StudioLibraryTab } from "./studioShared";

type StudioPaletteProps = {
  selectedId: string | null;
  selectedSector: string;
  sectorOptions: string[];
  libraryTab: StudioLibraryTab;
  libraryQuery: string;
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
  const tone = preset.category === "table"
    ? "border-sky-200/90 bg-[radial-gradient(circle_at_top,rgba(232,244,255,0.98),rgba(240,247,255,0.92)_55%,rgba(255,255,255,0.9)_100%)]"
    : preset.kind === "plant"
      ? "border-emerald-200/90 bg-[radial-gradient(circle_at_top,rgba(234,247,235,0.98),rgba(241,250,242,0.92)_55%,rgba(255,255,255,0.9)_100%)]"
      : "border-slate-200/90 bg-[radial-gradient(circle_at_top,rgba(248,250,252,0.98),rgba(244,247,250,0.92)_58%,rgba(255,255,255,0.9)_100%)]";

  return (
    <button
      type="button"
      className="h-auto min-w-0 whitespace-normal rounded-[28px] border border-slate-200/90 bg-white px-4 py-4 text-left shadow-[0_22px_44px_-34px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_28px_56px_-36px_rgba(15,23,42,0.42)] disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <div className="w-full min-w-0 space-y-4">
        <div className={cn("flex h-40 items-center justify-center overflow-hidden rounded-[26px] border px-4 py-3 shadow-inner", tone)}>
          <FloorPlanItemIllustration
            kind={preset.kind}
            shape={preset.shape}
            capacity={preset.capacity > 0 ? preset.capacity : undefined}
            className="block h-full w-full"
            decorative={false}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 break-words text-base font-semibold leading-6 text-slate-950">
              {preset.label}
            </span>
            {meta ? (
              <Badge variant="outline" className="shrink-0 rounded-full border-slate-200 bg-slate-50 text-slate-600">
                {meta}
              </Badge>
            ) : null}
          </div>
          <p className="break-words text-sm leading-5 text-slate-500">{preset.description}</p>
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
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] shadow-[0_24px_80px_-44px_rgba(15,23,42,0.4)]">
      <CardHeader className="space-y-4 border-b border-slate-200/80 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl text-slate-950">Palette studio</CardTitle>
            <CardDescription className="mt-1 text-slate-500">
              Ajoutez les objets sans encombrer la colonne. Le visuel prime sur les réglages.
            </CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
            {totalElements} elem.
          </Badge>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={libraryQuery}
            onChange={(event) => onLibraryQueryChange(event.target.value)}
            placeholder="Rechercher un preset..."
            className="h-12 rounded-2xl border-slate-200 bg-white pl-9"
          />
        </div>

        <Tabs value={libraryTab} onValueChange={(value) => onLibraryTabChange(value as StudioLibraryTab)}>
          <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-[22px] bg-slate-100/90 p-1.5">
            <TabsTrigger value="tables" className="rounded-[16px] px-3 py-3 text-xs font-semibold tracking-[0.08em]">Tables</TabsTrigger>
            <TabsTrigger value="seating" className="rounded-[16px] px-3 py-3 text-xs font-semibold tracking-[0.08em]">Assises</TabsTrigger>
            <TabsTrigger value="structure" className="rounded-[16px] px-3 py-3 text-xs font-semibold tracking-[0.08em]">Structure</TabsTrigger>
            <TabsTrigger value="decor" className="rounded-[16px] px-3 py-3 text-xs font-semibold tracking-[0.08em]">Decor</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-5 p-4">
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Secteur actif</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{selectedSector}</p>
            </div>

            {activePresets.length > 0 ? (
              <div className="space-y-4">
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
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-700">Aucun preset dans cette famille</p>
                <p className="mt-1 text-sm text-slate-500">Essayez une autre famille ou une recherche moins précise.</p>
              </div>
            )}

            <Collapsible open={sectorsOpen} onOpenChange={setSectorsOpen} className="rounded-[24px] border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Secteurs</p>
                  <p className="text-sm text-slate-500">Créez une zone puis basculez dessus immédiatement.</p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-600 hover:bg-slate-100">
                    {sectorsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="border-t border-slate-200 px-4 py-4">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {sectorOptions.map((sector) => (
                      <Button
                        key={sector}
                        type="button"
                        variant={sector === selectedSector ? "default" : "outline"}
                        className="rounded-2xl"
                        onClick={() => onSectorSelect(sector)}
                      >
                        {sector}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studio-new-sector" className="text-xs uppercase tracking-[0.18em] text-slate-500">Nouveau secteur</Label>
                    <div className="flex gap-2">
                      <Input
                        id="studio-new-sector"
                        value={newSectorName}
                        onChange={(event) => onNewSectorNameChange(event.target.value)}
                        placeholder="Terrasse, salon prive..."
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onAddSector();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white" onClick={onAddSector}>
                        Ajouter
                      </Button>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {selectedId ? (
              <Collapsible open={aiOpen} onOpenChange={setAiOpen} className="rounded-[24px] border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Assistant IA</p>
                    <p className="text-sm text-slate-500">À utiliser seulement pour amorcer rapidement une salle.</p>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-600 hover:bg-slate-100">
                      {aiOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="border-t border-slate-200 p-2">
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-1">
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
                      canvasWidth={1040}
                      canvasHeight={680}
                      onApply={onApplyAILayout}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              <div className="flex items-center gap-2 text-slate-700">
                <Wand2 className="h-4 w-4" />
                <span className="font-medium">Ajout rapide</span>
              </div>
              <p className="mt-2">
                Un tap ajoute le preset dans le secteur actif. Le configurateur n'apparait que pour les vraies tables.
              </p>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
