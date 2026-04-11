import { trackEvent } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  restaurantId: string;
  restaurantName: string;
  metadata?: Record<string, any>;
}

export type CartConflict = {
  type: "restaurant" | "mode";
  pendingItem?: Omit<CartItem, "quantity">;
  pendingMode?: "delivery" | "takeaway";
};

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => Promise<boolean>;
  removeItem: (menuItemId: string) => Promise<void>;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  restaurantId: string | null;
  cartMetadata: Record<string, any>;
  updateCartMetadata: (metadata: Record<string, any>) => void;
  orderMode: "delivery" | "takeaway";
  setOrderMode: (mode: "delivery" | "takeaway", options?: { force?: boolean }) => boolean;
  conflict: CartConflict | null;
  setConflict: (conflict: CartConflict | null) => void;
  resolveConflict: (action: "clear" | "checkout") => void;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: async () => false,
  removeItem: async () => { },
  updateQuantity: async () => { },
  clearCart: async () => { },
  total: 0,
  itemCount: 0,
  restaurantId: null,
  cartMetadata: {},
  updateCartMetadata: () => { },
  orderMode: "delivery",
  setOrderMode: () => false,
  conflict: null,
  setConflict: () => { },
  resolveConflict: () => { },
});

export const useCart = () => useContext(CartContext);

function canItemBeOrderedInMode(item: Omit<CartItem, "quantity">, mode: "delivery" | "takeaway"): boolean {
  if (item.metadata?.is_anti_waste) {
    return mode === "takeaway";
  }
  if (item.metadata?.is_flash_sale) {
    const canDelivery = item.metadata?.delivery_available !== false;
    const canTakeaway = item.metadata?.takeaway_available !== false;
    return mode === "delivery" ? canDelivery : canTakeaway;
  }
  return true;
}

function getRequiredModeForItem(item: Omit<CartItem, "quantity">): "delivery" | "takeaway" | null {
  if (item.metadata?.is_anti_waste) return "takeaway";
  if (item.metadata?.is_flash_sale) {
    const canDelivery = item.metadata?.delivery_available !== false;
    const canTakeaway = item.metadata?.takeaway_available !== false;
    if (canDelivery && !canTakeaway) return "delivery";
    if (!canDelivery && canTakeaway) return "takeaway";
  }
  return null;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [orderMode, setOrderModeState] = useState<"delivery" | "takeaway">(() => {
    try {
      const stored = localStorage.getItem("miamz-order-mode");
      return (stored as any) || "delivery";
    } catch {
      return "delivery";
    }
  });

  const [conflict, setConflict] = useState<CartConflict | null>(null);

  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem("miamz-cart");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [cartMetadata, setCartMetadata] = useState<Record<string, any>>(() => {
    try {
      const stored = localStorage.getItem("miamz-cart-metadata");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("miamz-cart", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("miamz-cart-metadata", JSON.stringify(cartMetadata));
  }, [cartMetadata]);

  useEffect(() => {
    localStorage.setItem("miamz-order-mode", orderMode);
  }, [orderMode]);

  const setOrderMode = (mode: "delivery" | "takeaway", options?: { force?: boolean }) => {
    if (options?.force) {
      setOrderModeState(mode);
      return false;
    }
    if (items.length > 0 && orderMode !== mode) {
      setConflict({ type: "mode", pendingMode: mode });
      return true;
    }
    setOrderModeState(mode);
    return false;
  };

  const restaurantId = items.length > 0 ? items[0].restaurantId : null;

  const addItem = async (item: Omit<CartItem, "quantity">) => {
    if (items.length > 0 && cartMetadata.feature !== "multi-restaurant" && items[0].restaurantId !== item.restaurantId) {
      setConflict({ type: "restaurant", pendingItem: item });
      return false;
    }

    if (!canItemBeOrderedInMode(item, orderMode)) {
      const requiredMode = getRequiredModeForItem(item);
      if (items.length === 0 && requiredMode) {
        setOrderModeState(requiredMode);
      } else {
        setConflict({
          type: "mode",
          pendingItem: item,
          pendingMode: requiredMode || (orderMode === "delivery" ? "takeaway" : "delivery"),
        });
        return false;
      }
    }

    // --- REAL-TIME STOCK DEDUCTION ---
    const isLimitedStock = item.metadata?.is_anti_waste || item.metadata?.is_flash_sale;
    if (isLimitedStock) {
      const table = item.metadata?.is_anti_waste ? 'anti_waste_offers' : 'flash_sales';
      const { data: success, error } = await supabase.rpc('decrement_stock', {
        p_table: table,
        p_id: item.menuItemId,
        p_qty: 1
      });

      if (error || !success) {
        toast.error("Stock insuffisant ou offre plus disponible.");
        return false;
      }
    }

    trackEvent({
      eventType: "add_to_cart",
      eventData: { item_name: item.name, price: item.price },
      restaurantId: item.restaurantId,
    });

    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.menuItemId && JSON.stringify(i.metadata) === JSON.stringify(item.metadata));
      if (existing) {
        return prev.map((i) =>
          (i.menuItemId === item.menuItemId && JSON.stringify(i.metadata) === JSON.stringify(item.metadata)) ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    
    return true;
  };

  const removeItem = async (menuItemId: string) => {
    const item = items.find(i => i.menuItemId === menuItemId);
    if (item && (item.metadata?.is_anti_waste || item.metadata?.is_flash_sale)) {
      const table = item.metadata?.is_anti_waste ? 'anti_waste_offers' : 'flash_sales';
      await supabase.rpc('increment_stock', {
        p_table: table,
        p_id: item.menuItemId,
        p_qty: item.quantity
      });
    }
    setItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  };

  const updateQuantity = async (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      await removeItem(menuItemId);
      return;
    }

    const item = items.find(i => i.menuItemId === menuItemId);
    if (item && (item.metadata?.is_anti_waste || item.metadata?.is_flash_sale)) {
      const table = item.metadata?.is_anti_waste ? 'anti_waste_offers' : 'flash_sales';
      const delta = quantity - item.quantity;
      
      if (delta > 0) {
        const { data: success } = await supabase.rpc('decrement_stock', {
          p_table: table,
          p_id: item.menuItemId,
          p_qty: delta
        });
        if (!success) {
          toast.error("Plus de stock disponible.");
          return;
        }
      } else if (delta < 0) {
        await supabase.rpc('increment_stock', {
          p_table: table,
          p_id: item.menuItemId,
          p_qty: Math.abs(delta)
        });
      }
    }

    setItems((prev) =>
      prev.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity } : i))
    );
  };

  const clearCart = async () => {
    // Release stock for all items
    for (const item of items) {
      if (item.metadata?.is_anti_waste || item.metadata?.is_flash_sale) {
        const table = item.metadata?.is_anti_waste ? 'anti_waste_offers' : 'flash_sales';
        await supabase.rpc('increment_stock', {
          p_table: table,
          p_id: item.menuItemId,
          p_qty: item.quantity
        });
      }
    }
    setItems([]);
    setCartMetadata({});
  };

  const resolveConflict = async (action: "clear" | "checkout") => {
    if (action === "clear") {
      const { pendingItem, pendingMode } = conflict || {};
      
      // Release all stock and clear cart
      await clearCart();
      
      if (pendingMode) {
        setOrderModeState(pendingMode);
      }
      
      if (pendingItem) {
        const requiredMode = getRequiredModeForItem(pendingItem);
        if (requiredMode) {
          setOrderModeState(requiredMode);
        }
        
        // Use the new async addItem which handles stock reservation properly
        await addItem(pendingItem);
      }
    }
    setConflict(null);
  };

  const updateCartMetadata = (metadata: Record<string, any>) => {
    setCartMetadata((prev) => ({ ...prev, ...metadata }));
  };

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart, total, itemCount, restaurantId,
      cartMetadata, updateCartMetadata, orderMode, setOrderMode,
      conflict, setConflict, resolveConflict
    }}>
      {children}
    </CartContext.Provider>
  );
}
