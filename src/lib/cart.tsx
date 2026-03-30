import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

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
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (menuItemId: string) => void;
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
  addItem: () => { },
  removeItem: () => { },
  updateQuantity: () => { },
  clearCart: () => { },
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

  const addItem = (item: Omit<CartItem, "quantity">) => {
    if (items.length > 0 && cartMetadata.feature !== "multi-restaurant" && items[0].restaurantId !== item.restaurantId) {
      setConflict({ type: "restaurant", pendingItem: item });
      return;
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
        return;
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
  };

  const removeItem = (menuItemId: string) => {
    setItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  };

  const updateQuantity = (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(menuItemId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => {
    setItems([]);
    setCartMetadata({});
  };

  const resolveConflict = (action: "clear" | "checkout") => {
    if (action === "clear") {
      const { pendingItem, pendingMode } = conflict || {};
      // Reset items and metadata directly via setters so the pending addItem
      // sees the empty cart through the functional updater.
      setItems([]);
      setCartMetadata({});
      if (pendingMode) {
        setOrderModeState(pendingMode);
      }
      if (pendingItem) {
        // Use setItems directly with functional updater to avoid stale closure
        // where addItem would still see the old items array.
        const requiredMode = getRequiredModeForItem(pendingItem);
        if (requiredMode) {
          setOrderModeState(requiredMode);
        }
        trackEvent({
          eventType: "add_to_cart",
          eventData: { item_name: pendingItem.name, price: pendingItem.price },
          restaurantId: pendingItem.restaurantId,
        });
        setItems([{ ...pendingItem, quantity: 1 }]);
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
