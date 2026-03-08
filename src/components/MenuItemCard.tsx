import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useToast } from "@/hooks/use-toast";
import { resolveMenuItemImageUrl } from "@/lib/menu-item-images";

interface MenuItemCardProps {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  category: string | null;
  restaurantId: string;
  restaurantName: string;
}

export default function MenuItemCard({ id, name, description, price, imageUrl, category, restaurantId, restaurantName }: MenuItemCardProps) {
  const { addItem } = useCart();
  const { toast } = useToast();

  const handleAdd = () => {
    addItem({ menuItemId: id, name, price, restaurantId, restaurantName });
    toast({ title: "Ajouté au panier", description: `${name} ajouté` });
  };

  const finalImageUrl = resolveMenuItemImageUrl({ name, description, category, imageUrl });

  return (
    <div className="flex gap-4 p-4 rounded-xl border bg-card hover:shadow-sm transition-shadow group">
      <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border bg-secondary/20">
        <img src={finalImageUrl} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <h4 className="font-semibold text-sm truncate">{name}</h4>
        {description && <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>}
        <p className="font-bold text-sm text-primary">{price.toFixed(2)} CHF</p>
      </div>
      <Button size="icon" variant="outline" className="shrink-0 self-center h-8 w-8 hover:bg-miamz-green hover:text-white transition-colors" onClick={handleAdd}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
