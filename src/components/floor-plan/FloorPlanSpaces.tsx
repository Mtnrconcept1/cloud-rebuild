import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Armchair,
  Check,
  Layers3,
  LayoutGrid,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFloorPlanSpaceStats } from "@/lib/floorPlanStudio";
import type { StudioDraftTable } from "./studioShared";
import FloorPlanMiniature from "./FloorPlanMiniature";

type Props = {
  sectors: string[];
  tables: StudioDraftTable[];
  selectedSector: string;
  newSectorName: string;
  onNewSectorNameChange: (name: string) => void;
  onAddSector: () => void;
  onSelectSector: (sector: string) => void;
  onEditSector: (sector: string) => void;
  onRenameSector: (name: string) => boolean;
  onSelectItem: (id: string) => void;
  variants: { id: string; name: string; count: number }[];
  activeVariantId: string | null;
  onLoadVariant: (id: string) => void;
  onSaveVariant: () => void;
  canLoadVariant: boolean;
  savingVariant: boolean;
};

export default function FloorPlanSpaces({
  sectors,
  tables,
  selectedSector,
  newSectorName,
  onNewSectorNameChange,
  onAddSector,
  onSelectSector,
  onEditSector,
  onRenameSector,
  onSelectItem,
  variants,
  activeVariantId,
  onLoadVariant,
  onSaveVariant,
  canLoadVariant,
  savingVariant,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(selectedSector);
  useEffect(() => setName(selectedSector), [selectedSector]);
  const selectedItems = tables.filter(
    (table) => table.sector === selectedSector,
  );
  const stats = getFloorPlanSpaceStats(selectedItems);

  return (
    <section
      className="min-h-0 flex-1 overflow-auto pb-2"
      aria-label="Gestion des espaces"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Vos espaces</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Organisez vos salles, votre terrasse et leurs configurations.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl bg-card"
          onClick={() => setAdding((value) => !value)}
          aria-expanded={adding}
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un espace
        </Button>
      </div>
      {adding ? (
        <form
          className="fp-panel mb-4 flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newSectorName.trim()) return;
            onAddSector();
            setAdding(false);
          }}
        >
          <div className="min-w-48 flex-1">
            <Label htmlFor="new-floor-plan-space">Nom de l'espace</Label>
            <Input
              id="new-floor-plan-space"
              value={newSectorName}
              onChange={(event) => onNewSectorNameChange(event.target.value)}
              placeholder="Terrasse, salon privé…"
              maxLength={80}
              className="mt-2"
              autoFocus
            />
            <p className="mt-2 text-xs text-muted-foreground">
              L'espace est conservé dès que son premier élément est enregistré.
            </p>
          </div>
          <Button type="submit" disabled={!newSectorName.trim()}>
            Créer l'espace
          </Button>
        </form>
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {sectors.map((sector) => {
          const items = tables.filter((table) => table.sector === sector);
          const count = getFloorPlanSpaceStats(items);
          return (
            <button
              type="button"
              key={sector}
              className="fp-space-card"
              onClick={() => onSelectSector(sector)}
              aria-pressed={selectedSector === sector}
            >
              <FloorPlanMiniature
                tables={items}
                label={`Plan de ${sector}`}
                className="max-h-44 w-full"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-3">
                <div>
                  <h3 className="font-display text-lg">{sector}</h3>
                  <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{count.tables} tables</span>
                    <span>·</span>
                    <span>{count.covers} couverts</span>
                  </p>
                </div>
                {selectedSector === sector ? (
                  <span className="rounded-full bg-orange-50 p-1.5 text-orange-600">
                    <Check className="h-4 w-4" />
                  </span>
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="fp-panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-xl">{selectedSector}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Disposition et capacité de l'espace
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => onEditSector(selectedSector)}
              >
                Aménager
                <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
            <FloorPlanMiniature
              tables={selectedItems}
              label={`Disposition de ${selectedSector}`}
              className="max-h-[420px]"
            />
          </div>
          <div className="fp-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-lg">
                Configurations enregistrées
              </h3>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-primary"
                disabled={savingVariant}
                onClick={onSaveVariant}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {savingVariant ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
            {variants.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {variants.map((variant) => (
                  <button
                    type="button"
                    key={variant.id}
                    disabled={!canLoadVariant}
                    onClick={() => onLoadVariant(variant.id)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3 text-left disabled:opacity-50"
                  >
                    <Layers3 className="h-5 w-5 shrink-0 text-primary/70" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {variant.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {variant.count} éléments · tous les espaces
                      </span>
                    </span>
                    {activeVariantId === variant.id ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Conservez plusieurs dispositions pour vos services et vos
                événements. Enregistrez le plan actuel pour créer la première
                configuration.
              </p>
            )}
            {!canLoadVariant && variants.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Enregistrez les modifications avant de charger une autre
                configuration.
              </p>
            ) : null}
          </div>
        </div>
        <div className="fp-panel space-y-5 p-4">
          <div>
            <h3 className="font-display text-xl">Réglages de l'espace</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Les modifications suivent la sauvegarde du plan.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRenameSector(name);
            }}
          >
            <Label htmlFor="floor-plan-space-name">Nom de l'espace</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="floor-plan-space-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                aria-label="Renommer l'espace"
                disabled={!name.trim() || name.trim() === selectedSector}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </form>
          <div className="grid grid-cols-3 gap-3 border-y border-border py-4">
            <div className="fp-stat">
              <LayoutGrid className="mb-2 h-4 w-4" />
              <strong>{stats.tables}</strong>Tables
            </div>
            <div className="fp-stat">
              <Users className="mb-2 h-4 w-4" />
              <strong>{stats.covers}</strong>Couverts
            </div>
            <div className="fp-stat">
              <Armchair className="mb-2 h-4 w-4" />
              <strong>{stats.furniture}</strong>Mobilier
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Éléments de l'espace</h4>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              {stats.hidden
                ? `${stats.hidden} élément(s) masqué(s), accessibles ci-dessous.`
                : "Sélectionnez un élément pour ouvrir ses réglages."}
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {selectedItems.map((table) => (
                <button
                  type="button"
                  key={table.id}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => onSelectItem(table.id)}
                >
                  <span className="truncate">{table.table_number}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {!table.is_active
                      ? "Masqué"
                      : table.capacity > 0
                        ? `${table.capacity} places`
                        : "Décor"}
                  </span>
                </button>
              ))}
              {!selectedItems.length ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Cet espace attend ses premiers éléments.
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            className="w-full rounded-xl"
            onClick={() => onEditSector(selectedSector)}
          >
            Aménager cet espace
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
