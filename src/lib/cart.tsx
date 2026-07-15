import { useCallback, useEffect, useRef, useState, ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { canUseClientRole, hasPrivilegedRole } from "@/lib/roleAccess";
import { CartContext, type CartConflict, type CartInputItem, type CartItem } from "@/lib/cart-context";
import { clearCartBrowserState } from "@/lib/sessionCleanup";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

function isGuaranteedDeliveryItem(item: CartInputItem | CartItem): boolean {
  return item.metadata?.is_guaranteed_delivery_slot === true
    || item.metadata?.feature === "creneaux-garantis";
}

export type { CartConflict, CartInputItem, CartItem } from "@/lib/cart-context";

function isGuaranteedDeliveryCart(metadata: Record<string, any>, items: CartItem[]): boolean {
  return metadata.feature === "creneaux-garantis"
    || metadata.is_guaranteed_delivery_slot === true
    || items.some(isGuaranteedDeliveryItem);
}

function canItemBeOrderedInMode(item: CartInputItem, mode: "delivery" | "takeaway"): boolean {
  if (isGuaranteedDeliveryItem(item)) {
    return mode === "delivery";
  }
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

function getRequiredModeForItem(item: CartInputItem): "delivery" | "takeaway" | null {
  if (isGuaranteedDeliveryItem(item)) return "delivery";
  if (item.metadata?.is_anti_waste) return "takeaway";
  if (item.metadata?.is_flash_sale) {
    const canDelivery = item.metadata?.delivery_available !== false;
    const canTakeaway = item.metadata?.takeaway_available !== false;
    if (canDelivery && !canTakeaway) return "delivery";
    if (!canDelivery && canTakeaway) return "takeaway";
  }
  return null;
}

function cartFeatureAllowsCrossRestaurant(metadata: Record<string, any>) {
  return metadata.feature === "multi-restaurant"
    || metadata.feature === "abonnement"
    || metadata.multi_restaurant === true;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, role, roles = [] } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const storageNamespace = isCommercialDemoClient
    ? `miamz-demo:${commercialDemoFrame.config.sessionId}:client`
    : "miamz";
  const cartStorageKey = `${storageNamespace}-cart`;
  const cartMetadataStorageKey = `${storageNamespace}-cart-metadata`;
  const orderModeStorageKey = `${storageNamespace}-order-mode`;
  const [orderMode, setOrderModeState] = useState<"delivery" | "takeaway">(() => {
    try {
      const stored = localStorage.getItem(orderModeStorageKey);
      return (stored as any) || "delivery";
    } catch {
      return "delivery";
    }
  });

  const [conflict, setConflict] = useState<CartConflict | null>(null);

  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(cartStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [cartMetadata, setCartMetadata] = useState<Record<string, any>>(() => {
    try {
      const stored = localStorage.getItem(cartMetadataStorageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const lastAuthenticatedUserIdRef = useRef<string | null>(user?.id ?? null);

  const resetCartState = useCallback(() => {
    setItems([]);
    setCartMetadata({});
    setConflict(null);
    setOrderModeState("delivery");
    if (isCommercialDemoClient) {
      localStorage.removeItem(cartStorageKey);
      localStorage.removeItem(cartMetadataStorageKey);
      localStorage.removeItem(orderModeStorageKey);
    } else {
      clearCartBrowserState();
    }
  }, [cartMetadataStorageKey, cartStorageKey, isCommercialDemoClient, orderModeStorageKey]);

  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(items));
  }, [cartStorageKey, items]);

  useEffect(() => {
    localStorage.setItem(cartMetadataStorageKey, JSON.stringify(cartMetadata));
  }, [cartMetadata, cartMetadataStorageKey]);

  useEffect(() => {
    localStorage.setItem(orderModeStorageKey, orderMode);
  }, [orderMode, orderModeStorageKey]);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    const previousUserId = lastAuthenticatedUserIdRef.current;

    if (previousUserId && previousUserId !== nextUserId) {
      resetCartState();
    }

    lastAuthenticatedUserIdRef.current = nextUserId;
  }, [resetCartState, user?.id]);

  useEffect(() => {
    if (!isCommercialDemoClient && user && hasPrivilegedRole(roles)) {
      resetCartState();
    }
  }, [isCommercialDemoClient, resetCartState, roles, user]);

  const setOrderMode = (mode: "delivery" | "takeaway", options?: { force?: boolean }) => {
    if (options?.force) {
      setOrderModeState(mode);
      return false;
    }
    if (mode === "takeaway" && isGuaranteedDeliveryCart(cartMetadata, items)) {
      setConflict({ type: "mode", pendingMode: "delivery" });
      return true;
    }
    if (items.length > 0 && orderMode !== mode) {
      setConflict({ type: "mode", pendingMode: mode });
      return true;
    }
    setOrderModeState(mode);
    return false;
  };

  const restaurantId = items.length > 0 ? items[0].restaurantId : null;

  const addItem = (item: CartInputItem) => {
    if (user && !canUseClientRole({ activeRole: role, roles })) {
      console.warn("[cart] privileged roles cannot add customer cart items");
      return;
    }

    const existingCartIsChefTable = items.length > 0 && items.every((cartItem) => cartItem.metadata?.is_chefs_table);
    const incomingItemIsChefTable = !!item.metadata?.is_chefs_table;
    const allowCrossRestaurant = cartFeatureAllowsCrossRestaurant(cartMetadata)
      || (existingCartIsChefTable && incomingItemIsChefTable);

    if (items.length > 0 && !allowCrossRestaurant && items[0].restaurantId !== item.restaurantId) {
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

    const resolvedQuantity = Math.max(
      1,
      Math.round(Number(item.quantity ?? item.metadata?.party_size ?? 1) || 1),
    );

    if (!isCommercialDemoClient) trackEvent({
      eventType: "add_to_cart",
      eventData: { item_name: item.name, price: item.price },
      restaurantId: item.restaurantId,
    });

    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.menuItemId && JSON.stringify(i.metadata) === JSON.stringify(item.metadata));
      if (existing) {
        if (item.metadata?.is_chefs_table) {
          return prev;
        }
        return prev.map((i) =>
          (i.menuItemId === item.menuItemId && JSON.stringify(i.metadata) === JSON.stringify(item.metadata))
            ? { ...i, quantity: i.quantity + resolvedQuantity }
            : i
        );
      }
      return [...prev, { ...item, quantity: resolvedQuantity }];
    });
  };

  const removeItem = (menuItemId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.menuItemId !== menuItemId);
      if (next.length === 0) {
        setCartMetadata({});
      }
      return next;
    });
  };

  const replaceCartItems = (
    nextItems: CartInputItem[],
    metadata: Record<string, any> = {},
    mode: "delivery" | "takeaway" = orderMode,
  ) => {
    if (user && !canUseClientRole({ activeRole: role, roles })) {
      console.warn("[cart] privileged roles cannot replace customer cart items");
      return;
    }

    const normalizedMode = mode === "takeaway" && (
      metadata.feature === "creneaux-garantis"
      || metadata.is_guaranteed_delivery_slot === true
      || nextItems.some(isGuaranteedDeliveryItem)
    ) ? "delivery" : mode;

    setConflict(null);
    setOrderModeState(normalizedMode);
    setCartMetadata(metadata);
    const normalizedItems = nextItems.map((item) => {
      const quantity = Math.max(
        1,
        Math.round(Number(item.quantity ?? item.metadata?.party_size ?? 1) || 1),
      );

      trackEvent({
        eventType: "add_to_cart",
        eventData: { item_name: item.name, price: item.price },
        restaurantId: item.restaurantId,
      });

      return { ...item, quantity };
    });
    setItems(normalizedItems);
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
    resetCartState();
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
        if (!isCommercialDemoClient) trackEvent({
          eventType: "add_to_cart",
          eventData: { item_name: pendingItem.name, price: pendingItem.price },
          restaurantId: pendingItem.restaurantId,
        });
        const resolvedQuantity = Math.max(
          1,
          Math.round(Number(pendingItem.quantity ?? pendingItem.metadata?.party_size ?? 1) || 1),
        );
        setItems([{ ...pendingItem, quantity: resolvedQuantity }]);
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
      items, addItem, replaceCartItems, removeItem, updateQuantity, clearCart, total, itemCount, restaurantId,
      cartMetadata, updateCartMetadata, orderMode, setOrderMode,
      conflict, setConflict, resolveConflict
    }}>
      {children}
    </CartContext.Provider>
  );
}
