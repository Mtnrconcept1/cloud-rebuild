import { useId, useMemo, useState } from "react";
import {
  Armchair,
  ArrowUpRight,
  Check,
  ChevronDown,
  Layers,
  LayoutPanelTop,
  Leaf,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import FloorPlanAIPanel, {
  type AIFloorPlanResult,
} from "@/components/floor-plan/FloorPlanAIPanel";
import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFloorPlanItemTypeLabel,
  type FloorPlanTablePreset,
} from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

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
  mode?: "compact" | "expanded";
  onOpenLibrary?: () => void;
  onOpenAssistant?: () => void;
  showInlineAssistant?: boolean;
  selectedTable?: StudioDraftTable | null;
  onInspectSelection?: () => void;
};

const LIBRARY_CATEGORIES = [
  { value: "tables", label: "Tables", icon: LayoutPanelTop },
  { value: "seating", label: "Assises", icon: Armchair },
  { value: "structure", label: "Structure", icon: Layers },
  { value: "decor", label: "Décor", icon: Leaf },
  { value: "event", label: "Événementiel", icon: Sparkles },
] as const;

function PresetIllustration({
  preset,
  className,
}: {
  preset: FloorPlanTablePreset;
  className?: string;
}) {
  return (
    <FloorPlanItemIllustration
      kind={preset.kind}
      shape={preset.shape}
      capacity={preset.capacity > 0 ? preset.capacity : undefined}
      seatType={preset.seatType}
      visualVariant={preset.visualVariant}
      className={cn("h-full w-full", className)}
      decorative
    />
  );
}

function StudioPresetCard({
  preset,
  onClick,
  disabled,
  expanded,
  selected,
}: {
  preset: FloorPlanTablePreset;
  onClick: () => void;
  disabled: boolean;
  expanded: boolean;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group relative flex min-w-0 touch-manipulation flex-col rounded-xl border bg-white/70 p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45",
        selected
          ? "border-primary bg-primary/[0.035]"
          : "border-[#e8e1d8] hover:border-primary/50 hover:bg-white",
        expanded && "p-4",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${expanded ? "Afficher" : "Ajouter"} ${preset.label}${preset.capacity ? `, ${preset.capacity} places` : ""}`}
      aria-pressed={expanded ? selected : undefined}
    >
      {selected ? (
        <span
          className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary text-white"
          aria-hidden="true"
        >
          <Check className="h-3 w-3" />
        </span>
      ) : null}
      <span
        className={cn(
          "flex h-[104px] w-full items-center justify-center px-1 py-2",
          expanded && "h-[164px] px-3 py-4 sm:h-[190px]",
        )}
      >
        <PresetIllustration preset={preset} />
      </span>
      <span
        className={cn(
          "mt-2 block w-full break-words text-[13px] font-semibold leading-snug text-[#302b27]",
          expanded && "font-display text-lg font-medium",
        )}
      >
        {preset.label}
      </span>
      <span className="mt-1 block text-xs text-[#82776f]">
        {preset.capacity > 0
          ? `${preset.capacity} places`
          : getFloorPlanItemTypeLabel(preset.kind, preset.shape)}
      </span>
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
  mode = "compact",
  onOpenLibrary,
  onOpenAssistant,
  showInlineAssistant = true,
  selectedTable,
  onInspectSelection,
}: StudioPaletteProps) {
  const inputId = useId();
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [focusedPresetId, setFocusedPresetId] = useState<string | null>(null);
  const [shapeFilter, setShapeFilter] = useState("all");
  const [capacityFilter, setCapacityFilter] = useState("all");
  const expanded = mode === "expanded";
  const activePresets = useMemo(
    () =>
      presetsByTab[libraryTab].filter((preset) => {
        if (!expanded || libraryTab !== "tables") return true;
        const shapeMatches =
          shapeFilter === "all" || preset.shape === shapeFilter;
        const capacityMatches =
          capacityFilter === "all" ||
          (capacityFilter === "6+"
            ? preset.capacity >= 6
            : preset.capacity === Number(capacityFilter));
        return shapeMatches && capacityMatches;
      }),
    [presetsByTab, libraryTab, expanded, shapeFilter, capacityFilter],
  );
  const totalPresets = Object.values(presetsByTab).reduce(
    (total, presets) => total + presets.length,
    0,
  );
  const focusedPreset =
    activePresets.find((preset) => preset.id === focusedPresetId) ||
    activePresets[0] ||
    null;

  const categories = (
    <nav
      aria-label="Catégories de mobilier"
      className={cn(
        "grid grid-cols-3 gap-1.5",
        expanded && "lg:flex lg:flex-col lg:gap-1",
      )}
    >
      {LIBRARY_CATEGORIES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={libraryTab === value}
          onClick={() => onLibraryTabChange(value)}
          className={cn(
            "flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            libraryTab === value
              ? "border-primary/65 bg-white text-primary"
              : "border-transparent bg-[#f4f0eb] text-[#75695f] hover:bg-[#ece5dc]",
            expanded && "text-xs sm:text-sm lg:justify-start lg:px-3 lg:py-3",
            expanded && libraryTab === value && "lg:bg-primary lg:text-white",
          )}
        >
          {expanded ? (
            <Icon
              className="hidden h-4 w-4 shrink-0 lg:block"
              aria-hidden="true"
            />
          ) : null}
          <span className="truncate">{label}</span>
        </button>
      ))}
    </nav>
  );

  const search = (
    <div className="relative">
      <Label htmlFor={`${inputId}-search`} className="sr-only">
        Rechercher un élément de mobilier
      </Label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92877f]"
        aria-hidden="true"
      />
      <Input
        id={`${inputId}-search`}
        value={libraryQuery}
        onChange={(event) => onLibraryQueryChange(event.target.value)}
        placeholder="Rechercher un élément…"
        className="h-11 rounded-lg border-[#e3dbd1] bg-white pl-9 text-sm shadow-none"
      />
    </div>
  );

  const catalogue = activePresets.length ? (
    <div
      className={cn(
        "grid grid-cols-2 gap-2",
        expanded && "gap-3 xl:grid-cols-3",
      )}
    >
      {activePresets.map((preset) => (
        <StudioPresetCard
          key={preset.id}
          preset={preset}
          onClick={() =>
            expanded ? setFocusedPresetId(preset.id) : onPresetClick(preset.id)
          }
          disabled={tablesLoading}
          expanded={expanded}
          selected={expanded && focusedPreset?.id === preset.id}
        />
      ))}
    </div>
  ) : (
    <div className="rounded-xl border border-dashed border-[#ded5c9] px-5 py-12 text-center">
      <Search className="mx-auto h-6 w-6 text-[#a79b8f]" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-[#433a33]">
        Aucun élément trouvé
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[#8b7f74]">
        Modifiez votre recherche ou choisissez une autre catégorie.
      </p>
      <Button
        type="button"
        variant="ghost"
        className="mt-3 text-primary"
        onClick={() => {
          onLibraryQueryChange("");
          setShapeFilter("all");
          setCapacityFilter("all");
        }}
      >
        Réinitialiser les filtres
      </Button>
    </div>
  );

  if (expanded) {
    return (
      <div
        className="grid h-full min-h-0 gap-4 lg:grid-cols-[170px_minmax(0,1fr)_270px]"
        data-floor-plan-library="expanded"
      >
        <aside className="min-w-0 rounded-xl border border-[#e8e1d8] bg-[#fbf9f5] p-4">
          <h3 className="mb-4 hidden font-display text-xl text-[#302b27] lg:block">
            Catégories
          </h3>
          {categories}
          <div className="mt-6 hidden border-t border-[#e8e1d8] pt-4 lg:block">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#94877a]">
              Espace actif
            </p>
            <p className="mt-2 break-words text-sm font-medium text-[#4d4238]">
              {selectedSector}
            </p>
          </div>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          {search}
          {libraryTab === "tables" ? (
            <div className="grid grid-cols-2 gap-2">
              <Select value={shapeFilter} onValueChange={setShapeFilter}>
                <SelectTrigger
                  className="h-10 rounded-lg border-[#e3dbd1] bg-white"
                  aria-label="Filtrer par forme"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les formes</SelectItem>
                  <SelectItem value="round">Rondes</SelectItem>
                  <SelectItem value="rect">Rectangulaires</SelectItem>
                </SelectContent>
              </Select>
              <Select value={capacityFilter} onValueChange={setCapacityFilter}>
                <SelectTrigger
                  className="h-10 rounded-lg border-[#e3dbd1] bg-white"
                  aria-label="Filtrer par capacité"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les capacités</SelectItem>
                  <SelectItem value="2">2 places</SelectItem>
                  <SelectItem value="4">4 places</SelectItem>
                  <SelectItem value="6+">6 places et plus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{catalogue}</div>
          <p className="text-xs text-[#8b7f74]" aria-live="polite">
            {activePresets.length} modèle{activePresets.length > 1 ? "s" : ""}{" "}
            disponible{activePresets.length > 1 ? "s" : ""}
          </p>
        </section>
        <aside className="flex min-w-0 flex-col rounded-xl border border-[#e8e1d8] bg-white p-4">
          {focusedPreset ? (
            <>
              <div className="flex h-52 items-center justify-center rounded-lg bg-[#f7f3ec] p-5">
                <PresetIllustration preset={focusedPreset} />
              </div>
              <h3 className="mt-5 break-words font-display text-2xl text-[#302b27]">
                {focusedPreset.label}
              </h3>
              {focusedPreset.description ? (
                <p className="mt-2 text-sm leading-relaxed text-[#8b7f74]">
                  {focusedPreset.description}
                </p>
              ) : null}
              <dl className="my-5 space-y-3 border-y border-[#eee7df] py-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8b7f74]">Type</dt>
                  <dd className="text-right font-medium text-[#4c4238]">
                    {getFloorPlanItemTypeLabel(
                      focusedPreset.kind,
                      focusedPreset.shape,
                    )}
                  </dd>
                </div>
                {focusedPreset.capacity > 0 ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8b7f74]">Capacité</dt>
                    <dd className="font-medium text-[#4c4238]">
                      {focusedPreset.capacity} places
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8b7f74]">Emplacement</dt>
                  <dd className="break-words text-right font-medium text-[#4c4238]">
                    {selectedSector}
                  </dd>
                </div>
              </dl>
              <Button
                type="button"
                className="mt-auto h-11 w-full gap-2 rounded-lg"
                disabled={tablesLoading}
                onClick={() => onPresetClick(focusedPreset.id)}
              >
                <Plus className="h-4 w-4" />
                Ajouter au plan
              </Button>
              <p className="mt-3 text-center text-xs leading-relaxed text-[#94877a]">
                Vous pourrez ajuster sa position et ses réglages sur le plan.
              </p>
            </>
          ) : (
            <p className="m-auto py-12 text-center text-sm text-[#8b7f74]">
              Choisissez un élément pour afficher ses détails.
            </p>
          )}
        </aside>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-floor-plan-library="compact"
    >
      <div className="shrink-0 space-y-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[23px] leading-tight text-[#302b27]">
            Bibliothèque
          </h2>
          <span className="shrink-0 rounded-md border border-[#e8e1d8] bg-white px-2 py-1 text-[11px] text-[#8b7f74]">
            {totalPresets} éléments
          </span>
        </div>
        {search}
        {categories}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-1 pr-1">
        {catalogue}
        {onOpenLibrary ? (
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full justify-end gap-1.5 rounded-lg px-1 text-xs text-primary"
            onClick={onOpenLibrary}
          >
            Ouvrir la bibliothèque
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        ) : null}

        {selectedTable && onInspectSelection ? (
          <button
            type="button"
            onClick={onInspectSelection}
            className="flex w-full items-center gap-3 rounded-xl border border-[#e8e1d8] border-l-[3px] border-l-primary bg-white p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="h-16 w-16 shrink-0 rounded-lg bg-[#f8f4ed] p-1">
              <FloorPlanItemIllustration
                kind={selectedTable.layout.kind}
                shape={selectedTable.layout.shape}
                visualVariant={selectedTable.layout.visualVariant}
                finish={selectedTable.layout.finish}
                capacity={selectedTable.capacity || undefined}
                seatType={selectedTable.layout.seatType}
                className="h-full w-full"
                decorative
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-lg text-[#302b27]">
                {selectedTable.table_number}
              </span>
              <span className="mt-0.5 block text-xs text-[#8b7f74]">
                {selectedTable.capacity
                  ? `${selectedTable.capacity} places`
                  : getFloorPlanItemTypeLabel(
                      selectedTable.layout.kind,
                      selectedTable.layout.shape,
                    )}
              </span>
              <span className="mt-2 block text-xs font-medium text-primary">
                Voir les réglages →
              </span>
            </span>
          </button>
        ) : null}

        <Collapsible
          open={sectorsOpen}
          onOpenChange={setSectorsOpen}
          className="rounded-xl border border-[#e8e1d8] bg-white"
        >
          <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Layers
              className="h-4 w-4 shrink-0 text-[#5b5046]"
              aria-hidden="true"
            />
            <span className="flex-1 text-sm font-medium text-[#433a33]">
              Secteurs
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-[#8b7f74] transition-transform",
                sectorsOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 border-t border-[#eee7df] p-4">
            <div className="flex flex-wrap gap-2">
              {sectorOptions.map((sector) => (
                <Button
                  key={sector}
                  type="button"
                  size="sm"
                  variant={sector === selectedSector ? "default" : "outline"}
                  className="h-auto min-h-9 whitespace-normal rounded-lg text-xs"
                  onClick={() => onSectorSelect(sector)}
                >
                  {sector}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label
                htmlFor={`${inputId}-sector`}
                className="text-xs text-[#75695f]"
              >
                Nouveau secteur
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`${inputId}-sector`}
                  value={newSectorName}
                  onChange={(event) =>
                    onNewSectorNameChange(event.target.value)
                  }
                  placeholder="Terrasse, salon privé…"
                  className="h-10 min-w-0 rounded-lg border-[#e3dbd1] bg-white text-xs"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newSectorName.trim()) {
                      event.preventDefault();
                      onAddSector();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0 rounded-lg"
                  onClick={onAddSector}
                  disabled={!newSectorName.trim()}
                  aria-label="Ajouter le secteur"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {onOpenAssistant ? (
          <button
            type="button"
            onClick={onOpenAssistant}
            className="flex w-full items-center gap-3 rounded-xl border border-[#e8e1d8] bg-white px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles
              className="h-4 w-4 shrink-0 text-[#5b5046]"
              aria-hidden="true"
            />
            <span className="flex-1 text-sm font-medium text-[#433a33]">
              Assistant d’aménagement
            </span>
            <ArrowUpRight
              className="h-4 w-4 text-[#8b7f74]"
              aria-hidden="true"
            />
          </button>
        ) : showInlineAssistant && selectedId ? (
          <Collapsible
            open={aiOpen}
            onOpenChange={setAiOpen}
            className="rounded-xl border border-[#e8e1d8] bg-white"
          >
            <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="flex-1 text-sm font-medium">Assistant IA</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-[#8b7f74] transition-transform",
                  aiOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-[#eee7df] p-3">
              <FloorPlanAIPanel
                restaurantId={selectedId}
                sectorLabel={selectedSector}
                currentLayout={draftTables
                  .filter((table) => table.sector === selectedSector)
                  .map((table) => ({
                    id: table.id,
                    table_number: table.table_number,
                    capacity: table.capacity,
                    layout: table.layout,
                  }))}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                onApply={onApplyAILayout}
                disabled={tablesLoading}
              />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </div>
  );
}
