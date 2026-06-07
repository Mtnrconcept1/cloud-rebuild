import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/lib/cart-context";
import { PUBLIC_MENU_ITEMS_LIMIT } from "@/lib/queryLimits";

const supabase = getSupabase();

type SuggestedMenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
};

type ScoredSuggestion = SuggestedMenuItem & {
  score: number;
  reason: string;
};

interface CartSuggestionsStepProps {
  restaurantId: string | null;
  currentItems: CartItem[];
  missingForFreeDelivery: number | null;
  onAdd: (item: SuggestedMenuItem) => void;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(value: unknown) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function itemSignalText(item: CartItem) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return [
    item.name,
    item.restaurantName,
    metadata.category,
    metadata.category_name,
    metadata.cuisine,
    metadata.cuisine_type,
    Array.isArray(metadata.tags) ? metadata.tags.join(" ") : "",
  ].filter(Boolean).join(" ");
}

function buildCartSignals(items: CartItem[]) {
  const tokens = new Set<string>();
  const categories = new Set<string>();

  for (const item of items) {
    for (const token of tokenize(itemSignalText(item))) {
      tokens.add(token);
    }

    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const category = normalizeText(metadata.category || metadata.category_name);
    if (category) categories.add(category);
  }

  return { tokens, categories };
}

function getSuggestionReason(item: SuggestedMenuItem, scoreParts: {
  fillsFreeDelivery: boolean;
  categoryMatch: boolean;
  tokenMatches: number;
  isDessert: boolean;
  isDrink: boolean;
}) {
  if (scoreParts.fillsFreeDelivery) return "Aide a atteindre la livraison offerte";
  if (scoreParts.categoryMatch || scoreParts.tokenMatches > 0) return "Proche des produits deja choisis";
  if (scoreParts.isDessert) return "Dessert souvent ajoute en fin de commande";
  if (scoreParts.isDrink) return "Boisson pratique avec votre repas";
  return item.category ? `Suggestion ${item.category}` : "Suggestion du restaurant";
}

function scoreSuggestion(
  item: SuggestedMenuItem,
  signals: ReturnType<typeof buildCartSignals>,
  missingForFreeDelivery: number | null,
): ScoredSuggestion {
  const itemText = `${item.name} ${item.description || ""} ${item.category || ""}`;
  const itemTokens = tokenize(itemText);
  const itemCategory = normalizeText(item.category);
  const tokenMatches = itemTokens.filter((token) => signals.tokens.has(token)).length;
  const categoryMatch = Boolean(itemCategory && signals.categories.has(itemCategory));
  const isDessert = /dessert|glace|tiramisu|gateau|chocolat|fruit|sweet/.test(normalizeText(itemText));
  const isDrink = /boisson|drink|coca|soda|eau|jus|the|cafe/.test(normalizeText(itemText));
  const fillsFreeDelivery = Boolean(missingForFreeDelivery && Number(item.price) >= missingForFreeDelivery);
  const price = Number(item.price) || 0;

  const score = [
    fillsFreeDelivery ? 45 : 0,
    categoryMatch ? 35 : 0,
    Math.min(tokenMatches * 12, 36),
    isDessert ? 14 : 0,
    isDrink ? 12 : 0,
    price > 0 && price <= 8 ? 8 : 0,
    price > 8 && price <= 18 ? 4 : 0,
  ].reduce((sum, value) => sum + value, 0);

  return {
    ...item,
    score,
    reason: getSuggestionReason(item, {
      fillsFreeDelivery,
      categoryMatch,
      tokenMatches,
      isDessert,
      isDrink,
    }),
  };
}

export default function CartSuggestionsStep({
  restaurantId,
  currentItems,
  missingForFreeDelivery,
  onAdd,
}: CartSuggestionsStepProps) {
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const { data: menuItems = [], isLoading } = useQuery({
    queryKey: ["cart-suggestions", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, restaurant_id, name, description, price, category, image_url")
        .eq("restaurant_id", restaurantId!)
        .eq("is_available", true)
        .limit(PUBLIC_MENU_ITEMS_LIMIT);

      if (error) throw error;
      return (data || []) as SuggestedMenuItem[];
    },
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    const currentItemIds = new Set(currentItems.map((item) => item.menuItemId));
    const signals = buildCartSignals(currentItems);

    return menuItems
      .filter((item) => !currentItemIds.has(item.id))
      .map((item) => scoreSuggestion(item, signals, missingForFreeDelivery))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(a.price) - Number(b.price);
      })
      .slice(0, 6);
  }, [currentItems, menuItems, missingForFreeDelivery]);

  const handleAdd = (item: SuggestedMenuItem) => {
    setAddedIds((previous) => new Set(previous).add(item.id));
    onAdd(item);
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Suggestions personnalisees</p>
          <p className="text-sm text-muted-foreground">
            TOK propose des produits proches de vos choix et utiles pour completer la commande.
          </p>
        </div>
      </div>

      {missingForFreeDelivery && missingForFreeDelivery > 0 ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
          Il manque {missingForFreeDelivery.toFixed(2)} CHF pour atteindre la livraison offerte Tok One.
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recherche de produits pertinents...
        </div>
      ) : suggestions.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 grid-cols-[minmax(0,1fr)]">
          {suggestions.map((item) => (
            <div
              key={item.id}
              className="grid min-w-0 grid-cols-[76px_minmax(0,1fr)] overflow-hidden rounded-xl border bg-background sm:flex sm:flex-col"
            >
              <div className="flex h-full min-h-[76px] items-center justify-center bg-muted sm:aspect-[4/3] sm:min-h-0 sm:w-full">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-base font-bold text-muted-foreground sm:text-2xl">TOK</span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                <div className="min-w-0 space-y-1">
                  <p className="line-clamp-2 break-words text-sm font-semibold">{item.name}</p>
                  <p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.reason}</p>
                  <p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-auto w-full"
                  variant={addedIds.has(item.id) ? "secondary" : "default"}
                  disabled={addedIds.has(item.id)}
                  onClick={() => handleAdd(item)}
                >
                  {addedIds.has(item.id) ? (
                    "Ajoute"
                  ) : (
                    <>
                      <Plus className="mr-1 h-4 w-4" />
                      Ajouter
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          Aucun produit supplementaire pertinent pour ce panier. Vous pouvez passer directement au paiement.
        </div>
      )}
    </div>
  );
}
