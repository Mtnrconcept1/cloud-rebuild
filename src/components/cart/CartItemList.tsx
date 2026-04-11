import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, Loader2 } from "lucide-react";

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
  updateQuantity: (id: string, qty: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

export default function CartItemList({ items, updateQuantity, removeItem }: CartItemListProps) {
  const [busyItems, setBusyItems] = useState<Set<string>>(new Set());

  const handleUpdate = async (id: string, qty: number) => {
    if (busyItems.has(id)) return;
    setBusyItems(prev => new Set(prev).add(id));
    try {
      await updateQuantity(id, qty);
    } finally {
      setBusyItems(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRemove = async (id: string) => {
    if (busyItems.has(id)) return;
    setBusyItems(prev => new Set(prev).add(id));
    try {
      await removeItem(id);
    } finally {
      setBusyItems(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const isBusy = busyItems.has(item.menuItemId);
        return (
          <div key={`${item.menuItemId}-${index}`} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{item.name}</p>
              <p className="text-sm text-primary font-bold">{(item.price * item.quantity).toFixed(2)} CHF</p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                size="icon" 
                variant="outline" 
                className="h-7 w-7" 
                onClick={() => handleUpdate(item.menuItemId, item.quantity - 1)}
                disabled={isBusy}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="text-sm font-medium w-6 text-center">
                {isBusy ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : item.quantity}
              </span>
              <Button 
                size="icon" 
                variant="outline" 
                className="h-7 w-7" 
                onClick={() => handleUpdate(item.menuItemId, item.quantity + 1)}
                disabled={isBusy}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7 text-destructive" 
                onClick={() => handleRemove(item.menuItemId)}
                disabled={isBusy}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
