import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { CartItem } from "@/lib/cart-context";
import {
  buildCartSuggestions,
  type HistoricalOrderForSuggestions,
  type SuggestedMenuItem,
} from "@/lib/cartSuggestions";
import { PUBLIC_MENU_ITEMS_LIMIT } from "@/lib/queryLimits";

const supabase = getSupabase();

interface CartSuggestionsStepProps {
  restaurantId: string | null;
  currentItems: CartItem[];
  missingForFreeDelivery: number | null;
  onAdd: (item: SuggestedMenuItem) => void;
}

export default function CartSuggestionsStep({
  restaurantId,
  currentItems,
  missingForFreeDelivery,
  onAdd,
}: CartSuggestionsStepProps) {
  const { user } = useAuth();
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

  const { data: orderHistory = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["cart-suggestions-order-history", restaurantId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, status, payment_status, order_items(menu_item_id, quantity, metadata)")
        .eq("restaurant_id", restaurantId!)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.warn("[cart-suggestions] order history unavailable", error.message);
        return [];
      }

      return (data || []) as HistoricalOrderForSuggestions[];
    },
    enabled: Boolean(restaurantId && user?.id),
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    return buildCartSuggestions({
      currentItems,
      menuItems,
      orderHistory,
      missingForFreeDelivery,
    });
  }, [currentItems, menuItems, orderHistory, missingForFreeDelivery]);

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

      {isLoading || isHistoryLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recherche de produits pertinents...
        </div>
      ) : suggestions.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 grid-cols-[minmax(0,1fr)]">
          {suggestions.map((item) => (
            <div
              key={item.id}
              className="grid min-w-0 grid-cols-[76px_minmax(0,1fr)] overflow-hidden rounded-xl border bg-background sm:flex sm:h-full sm:flex-col"
            >
              <div className="relative flex h-full min-h-[104px] w-[76px] shrink-0 items-center justify-center overflow-hidden bg-muted sm:aspect-[4/3] sm:h-auto sm:min-h-0 sm:w-full">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-muted-foreground sm:text-2xl">TOK</span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5 sm:p-3">
                <div className="min-w-0 space-y-1">
                  <p className="line-clamp-1 break-words text-sm font-semibold sm:line-clamp-2">{item.name}</p>
                  <p className="line-clamp-1 break-words text-xs text-muted-foreground sm:line-clamp-2">{item.reason}</p>
                </div>
                <div className="mt-auto flex items-center gap-2 sm:flex-col sm:items-stretch">
                  <p className="min-w-0 flex-1 text-sm font-bold text-primary sm:flex-none">{Number(item.price).toFixed(2)} CHF</p>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 px-3 sm:h-9 sm:w-full"
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
