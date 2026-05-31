import { createContext, useContext } from "react";

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  restaurantId: string;
  restaurantName: string;
  metadata?: Record<string, any>;
}

export type CartInputItem = Omit<CartItem, "quantity"> & { quantity?: number };

export type CartConflict = {
  type: "restaurant" | "mode";
  pendingItem?: CartInputItem;
  pendingMode?: "delivery" | "takeaway";
};

export interface CartContextType {
  items: CartItem[];
  addItem: (item: CartInputItem) => void;
  replaceCartItems: (
    items: CartInputItem[],
    metadata?: Record<string, any>,
    mode?: "delivery" | "takeaway",
  ) => void;
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

export const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => { },
  replaceCartItems: () => { },
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
