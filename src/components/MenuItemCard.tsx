import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { trackClick, trackImpression } from "@/lib/analytics";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { resolveMenuItemImageUrl } from "@/lib/menu-item-images";
import { Button } from "@/components/ui/button";

interface MenuItemCardProps {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  category: string | null;
  restaurantId: string;
  restaurantName: string;
  disabled?: boolean;
  disabledReason?: string;
}

export default function MenuItemCard({
  id,
  name,
  description,
  price,
  imageUrl,
  category,
  restaurantId,
  restaurantName,
  disabled = false,
  disabledReason,
}: MenuItemCardProps) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const impressionTracked = useRef(false);

  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;
    trackImpression("dish", id, "restaurant_detail");
  }, [id]);

  const handleAdd = () => {
    if (disabled) {
      toast({
        title: "Indisponible",
        description: disabledReason || "Cette commande n'est pas disponible actuellement.",
        variant: "destructive",
      });
      return;
    }

    trackClick("dish", id);
    addItem({ menuItemId: id, name, price, restaurantId, restaurantName });
    toast({ title: "Ajoute au panier", description: `${name} ajoute` });
  };

  const finalImageUrl = resolveMenuItemImageUrl({ name, description, category, imageUrl });

  return (
    <div className={`group flex gap-4 rounded-xl border bg-card p-4 transition-shadow ${disabled ? "opacity-60" : "hover:shadow-sm"}`}>
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-secondary/20">
        <img
          src={finalImageUrl}
          alt={name}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h4 className="truncate text-sm font-semibold">{name}</h4>
        {description ? <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p> : null}
        <p className="text-sm font-bold text-primary">{price.toFixed(2)} CHF</p>
        {disabledReason ? <p className="text-[11px] text-muted-foreground">{disabledReason}</p> : null}
      </div>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0 self-center transition-colors hover:bg-miamz-green hover:text-white"
        onClick={handleAdd}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
