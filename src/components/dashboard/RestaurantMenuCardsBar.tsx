import { useState } from "react";
import { CheckCircle2, Layers, Loader2, Plus, Power, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type RestaurantMenuCard = {
  id: string;
  restaurant_id: string;
  name: string;
  is_active: boolean;
  activated_at: string | null;
  created_at: string;
};

const MENU_CARD_NAME_SUGGESTIONS = [
  "Carte d’hiver",
  "Carte de printemps",
  "Carte d’été",
  "Carte d’automne",
];

type RestaurantMenuCardsBarProps = {
  cards: RestaurantMenuCard[];
  viewedCardId: string | null;
  itemCounts: Record<string, number>;
  totalItemCount: number;
  disabled?: boolean;
  disabledReason?: string;
  creating?: boolean;
  activatingId?: string | null;
  deletingId?: string | null;
  onSelect: (cardId: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onActivate: (cardId: string) => void;
  onDelete: (cardId: string) => void;
};

export default function RestaurantMenuCardsBar({
  cards,
  viewedCardId,
  itemCounts,
  totalItemCount,
  disabled = false,
  disabledReason,
  creating = false,
  activatingId = null,
  deletingId = null,
  onSelect,
  onCreate,
  onActivate,
  onDelete,
}: RestaurantMenuCardsBarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmActivationId, setConfirmActivationId] = useState<string | null>(null);

  const activeCard = cards.find((card) => card.is_active) || null;
  const viewedCard = cards.find((card) => card.id === viewedCardId) || null;
  const viewedCount = viewedCard ? itemCounts[viewedCard.id] || 0 : totalItemCount;
  const cardToActivate = cards.find((card) => card.id === confirmActivationId) || null;
  const trimmedName = newName.trim();

  const openCreate = () => {
    setNewName("");
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!trimmedName || creating) return;
    const created = await onCreate(trimmedName);
    if (created) setCreateOpen(false);
  };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-label="Cartes du restaurant">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
            Cartes du restaurant
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Préparez votre carte d’hiver ou d’automne à l’avance, puis activez-la en un clic. Les plats des autres cartes sont conservés mais invisibles pour vos clients.
          </p>
        </div>
        <Button type="button" variant="outline" className="shrink-0" onClick={openCreate} disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle carte vierge
        </Button>
      </div>

      {disabled && disabledReason ? (
        <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {cards.length === 0 ? (
          <span
            className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium"
          >
            Carte actuelle
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
            <span className="text-xs text-muted-foreground">{totalItemCount}</span>
          </span>
        ) : (
          cards.map((card) => {
            const selected = card.id === viewedCardId;
            return (
              <button
                key={card.id}
                type="button"
                aria-pressed={selected}
                aria-label={`Afficher la carte ${card.name}${card.is_active ? " (active)" : ""}`}
                onClick={() => onSelect(card.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  selected ? "border-primary bg-primary/10" : "hover:border-primary/60",
                )}
              >
                {card.name}
                {card.is_active ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
                <span className="text-xs text-muted-foreground">{itemCounts[card.id] || 0}</span>
              </button>
            );
          })
        )}
      </div>

      {viewedCard && !viewedCard.is_active ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Vous modifiez <strong>« {viewedCard.name} »</strong>, qui n’est pas encore visible par vos clients. Ajoutez ses plats, puis activez-la quand vous êtes prêt.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDelete(viewedCard.id)}
              disabled={disabled || viewedCount > 0 || deletingId === viewedCard.id}
              title={viewedCount > 0 ? "Supprimez ou déplacez d’abord les plats de cette carte." : undefined}
            >
              {deletingId === viewedCard.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Supprimer
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmActivationId(viewedCard.id)}
              disabled={disabled || activatingId === viewedCard.id}
            >
              {activatingId === viewedCard.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
              Activer cette carte
            </Button>
          </div>
        </div>
      ) : null}

      {viewedCard?.is_active ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          « {viewedCard.name} » est la carte proposée à vos clients.
        </p>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle carte vierge</DialogTitle>
            <DialogDescription>
              La carte est créée vide et reste inactive : votre carte actuelle continue d’être proposée à vos clients pendant que vous la préparez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="menu-card-name">Nom de la carte</Label>
              <Input
                id="menu-card-name"
                value={newName}
                maxLength={80}
                placeholder="Ex : Carte d’hiver"
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitCreate();
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {MENU_CARD_NAME_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full border px-3 py-1 text-xs hover:border-primary/60"
                  onClick={() => setNewName(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button type="button" onClick={() => void submitCreate()} disabled={!trimmedName || creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Créer la carte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cardToActivate} onOpenChange={(open) => { if (!open) setConfirmActivationId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Activer « {cardToActivate?.name} » ?</DialogTitle>
            <DialogDescription>
              {`Les ${cardToActivate ? itemCounts[cardToActivate.id] || 0 : 0} plat(s) de cette carte deviendront commandables`}
              {activeCard ? ` et « ${activeCard.name} » sera masquée pour vos clients` : ""}
              . Aucun plat n’est supprimé : vous pourrez revenir à l’ancienne carte à tout moment.
            </DialogDescription>
          </DialogHeader>
          {cardToActivate && (itemCounts[cardToActivate.id] || 0) === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Cette carte est vide : vos clients ne verront plus aucun plat tant que vous n’en ajoutez pas.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmActivationId(null)}>Annuler</Button>
            <Button
              type="button"
              onClick={() => {
                if (cardToActivate) onActivate(cardToActivate.id);
                setConfirmActivationId(null);
              }}
            >
              Activer la carte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
