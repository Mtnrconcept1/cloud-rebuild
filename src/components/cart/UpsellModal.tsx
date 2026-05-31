import { useEffect, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import type { CartItem } from "@/lib/cart-context";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const supabase = getSupabase();

interface UpsellModalProps {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  onAdd: (item: any) => void;
  restaurantId: string | null;
  missingForFreeDelivery: number | null;
  currentItems: CartItem[];
}

export default function UpsellModal({
  open,
  onClose,
  onContinue,
  onAdd,
  restaurantId,
  missingForFreeDelivery,
  currentItems,
}: UpsellModalProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !restaurantId) return;

    let mounted = true;
    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("menu_items")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("is_available", true);

        if (error || !data) return;

        const cartItemIds = new Set(currentItems.map((i) => i.menuItemId));
        const availableItems = data.filter((item) => !cartItemIds.has(item.id));

        let picked: any[] = [];

        // 1. If trying to reach free delivery, find something just above the missing amount
        if (missingForFreeDelivery && missingForFreeDelivery > 0) {
          const gapFillers = availableItems
            .filter((i) => Number(i.price) >= missingForFreeDelivery)
            .sort((a, b) => Number(a.price) - Number(b.price));
          if (gapFillers.length > 0) {
            picked.push(gapFillers[0]);
          }
        }

        // 2. Find a dessert or drink
        const desserts = availableItems.filter((i) => 
          i.category?.toLowerCase().includes("dessert") || 
          i.name.toLowerCase().includes("dessert") ||
          i.name.toLowerCase().includes("glace") ||
          i.name.toLowerCase().includes("sweet")
        );
        const drinks = availableItems.filter((i) => 
          i.category?.toLowerCase().includes("boisson") || 
          i.category?.toLowerCase().includes("drink") ||
          i.name.toLowerCase().includes("coca") ||
          i.name.toLowerCase().includes("soda")
        );

        if (desserts.length > 0 && picked.length < 3) {
          // pick a random dessert
          picked.push(desserts[Math.floor(Math.random() * desserts.length)]);
        }
        if (drinks.length > 0 && picked.length < 3) {
          // pick a random drink
          picked.push(drinks[Math.floor(Math.random() * drinks.length)]);
        }

        // 3. Fallback: cheap items (< 5 CHF)
        if (picked.length < 2) {
          const cheapItems = availableItems
            .filter((i) => Number(i.price) > 0 && Number(i.price) < 5)
            .sort(() => 0.5 - Math.random()) // shuffle
            .filter(i => !picked.find(p => p.id === i.id));
            
          for (const cheap of cheapItems) {
            if (picked.length >= 3) break;
            picked.push(cheap);
          }
        }

        // Remove duplicates
        picked = picked.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

        if (mounted) {
          setSuggestions(picked.slice(0, 3));
        }
      } catch (err) {
        console.error("Error fetching suggestions", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchSuggestions();

    return () => {
      mounted = false;
    };
  }, [open, restaurantId, missingForFreeDelivery, currentItems]);

  const handleAdd = (item: any) => {
    setAddedIds((prev) => new Set(prev).add(item.id));
    onAdd(item);
  };

  // If no suggestions, we shouldn't really show the modal, or it will just be an empty state.
  // We handle that in the parent by closing it immediately or not opening it, 
  // but just in case, we can show a loader or fallback.
  
  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-background">
        <div className="relative">
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-2 top-2 z-10 rounded-full bg-background/50 backdrop-blur-sm"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="bg-primary/10 p-6 pt-8 pb-10 text-center">
            <div className="mx-auto bg-primary/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-xl font-bold font-display text-primary">
              Un petit creux en plus ?
            </DialogTitle>
            <DialogDescription className="text-foreground/80 mt-2">
              {missingForFreeDelivery && missingForFreeDelivery > 0
                ? `Ajoutez un de ces articles pour obtenir la livraison gratuite ! (Manque ${(missingForFreeDelivery).toFixed(2)} CHF)`
                : "Complétez votre commande avec l'une de nos suggestions gourmandes."}
            </DialogDescription>
          </div>

          <div className="px-6 pb-6 -mt-6">
            <div className="bg-card rounded-xl border shadow-sm p-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">Recherche de suggestions...</p>
                </div>
              ) : suggestions.length > 0 ? (
                <ScrollArea className="w-full whitespace-nowrap pb-4">
                  <div className="flex w-max space-x-4">
                    {suggestions.map((item) => (
                      <div 
                        key={item.id} 
                        className="w-[160px] shrink-0 space-y-3 rounded-lg border bg-background p-3 flex flex-col items-center text-center"
                      >
                        <div className="w-20 h-20 bg-muted rounded-full overflow-hidden flex items-center justify-center">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-2xl">🍽️</span>
                          )}
                        </div>
                        <div className="space-y-1 w-full">
                          <p className="text-sm font-semibold truncate w-full px-1">{item.name}</p>
                          <p className="text-xs text-primary font-bold">{Number(item.price).toFixed(2)} CHF</p>
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full rounded-full"
                          variant={addedIds.has(item.id) ? "secondary" : "default"}
                          onClick={() => handleAdd(item)}
                          disabled={addedIds.has(item.id)}
                        >
                          {addedIds.has(item.id) ? (
                            "Ajouté ✓"
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1" /> Ajouter
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">Aucune suggestion disponible.</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex flex-col gap-2">
              <Button 
                variant={addedIds.size > 0 ? "default" : "ghost"} 
                className={`w-full ${addedIds.size > 0 ? "rounded-full shadow-lg" : "text-muted-foreground underline"}`} 
                onClick={onContinue}
              >
                {addedIds.size > 0 ? "Valider ma commande" : "Non merci, valider mon panier"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
