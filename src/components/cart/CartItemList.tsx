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
      {items.map((item) => (
        <div key={item.menuItemId} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{item.name}</p>
            <p className="text-sm text-primary font-bold">{(item.price * item.quantity).toFixed(2)} CHF</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}>
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}>
              <Plus className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.menuItemId)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
