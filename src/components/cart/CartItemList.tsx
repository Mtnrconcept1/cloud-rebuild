import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2 } from "lucide-react";

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  restaurantName?: string;
  metadata?: any;
}

interface CartItemListProps {
  items: CartItem[];
  updateQuantity: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
}

export default function CartItemList({ items, updateQuantity, removeItem }: CartItemListProps) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.menuItemId}-${index}`} className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.name}</p>
            {item.metadata?.is_meal_subscription ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                {item.restaurantName ? <p>{item.restaurantName}</p> : null}
                <p>
                  {item.metadata.subscription_day || "Jour planifié"} - livraison {item.metadata.preferred_time || "12:00"}
                </p>
              </div>
            ) : item.restaurantName ? (
              <p className="text-xs text-muted-foreground">{item.restaurantName}</p>
            ) : null}
            {item.metadata?.is_chefs_table && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  {item.metadata?.chef_name ? `${item.metadata.chef_name} - ` : ""}
                  {item.metadata?.service_time ? `service ${item.metadata.service_time}` : "service dedie"}
                </p>
                <p>{item.quantity} convive{item.quantity > 1 ? "s" : ""}</p>
              </div>
            )}
            <p className="text-sm font-bold text-primary">{(item.price * item.quantity).toFixed(2)} CHF</p>
          </div>
          <div className="flex items-center gap-2">
            {item.metadata?.is_chefs_table ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {item.quantity} convive{item.quantity > 1 ? "s" : ""}
              </span>
            ) : (
              <>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              onClick={() => removeItem(item.menuItemId)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
