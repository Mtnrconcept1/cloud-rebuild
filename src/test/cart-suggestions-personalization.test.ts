import { describe, expect, it } from "vitest";

import {
  buildCartSuggestions,
  type HistoricalOrderForSuggestions,
  type SuggestedMenuItem,
} from "@/lib/cartSuggestions";
import type { CartItem } from "@/lib/cart-context";

const restaurantId = "restaurant-1";

function menuItem(overrides: Partial<SuggestedMenuItem> & Pick<SuggestedMenuItem, "id" | "name" | "category">): SuggestedMenuItem {
  return {
    restaurant_id: restaurantId,
    description: null,
    image_url: null,
    price: 8,
    ...overrides,
  };
}

function cartItem(overrides: Partial<CartItem> & Pick<CartItem, "menuItemId" | "name">): CartItem {
  return {
    price: 10,
    quantity: 1,
    restaurantId,
    restaurantName: "Restaurant test",
    ...overrides,
  };
}

describe("cart suggestions personalization", () => {
  it("prefers previously ordered products from the same restaurant when they are missing from the current cart", () => {
    const menuItems = [
      menuItem({ id: "burger", name: "Burger signature", category: "Plat" }),
      menuItem({ id: "mango-lassi", name: "Mango lassi", category: "Boisson" }),
      menuItem({ id: "tiramisu", name: "Tiramisu", category: "Dessert" }),
    ];
    const currentItems = [
      cartItem({ menuItemId: "burger", name: "Burger signature", metadata: { category: "Plat" } }),
    ];
    const orderHistory: HistoricalOrderForSuggestions[] = [
      {
        id: "order-1",
        created_at: "2026-06-01T12:00:00.000Z",
        status: "delivered",
        payment_status: "paid",
        order_items: [
          { menu_item_id: "burger", quantity: 1 },
          { menu_item_id: "mango-lassi", quantity: 2 },
        ],
      },
    ];

    const suggestions = buildCartSuggestions({
      currentItems,
      menuItems,
      orderHistory,
      missingForFreeDelivery: null,
    });

    expect(suggestions[0]?.id).toBe("mango-lassi");
    expect(suggestions[0]?.reason).toBe("Deja commande dans ce restaurant");
    expect(suggestions.map((item) => item.id)).not.toContain("burger");
  });

  it("falls back to a missing dessert, drink or starter when there is no missing historical product", () => {
    const menuItems = [
      menuItem({ id: "main", name: "Poulet yassa", category: "Plat" }),
      menuItem({ id: "drink", name: "Eau gazeuse", category: "Boisson" }),
      menuItem({ id: "dessert", name: "Fondant chocolat", category: "Dessert" }),
      menuItem({ id: "starter", name: "Salade maison", category: "Entree" }),
    ];
    const currentItems = [
      cartItem({ menuItemId: "main", name: "Poulet yassa", metadata: { category: "Plat" } }),
      cartItem({ menuItemId: "drink", name: "Eau gazeuse", metadata: { category: "Boisson" } }),
    ];
    const orderHistory: HistoricalOrderForSuggestions[] = [
      {
        id: "order-1",
        created_at: "2026-06-01T12:00:00.000Z",
        status: "delivered",
        payment_status: "paid",
        order_items: [
          { menu_item_id: "main", quantity: 1 },
          { menu_item_id: "drink", quantity: 1 },
        ],
      },
    ];

    const suggestions = buildCartSuggestions({
      currentItems,
      menuItems,
      orderHistory,
      missingForFreeDelivery: null,
    });

    expect(suggestions[0]?.id).toBe("dessert");
    expect(suggestions[0]?.reason).toBe("Dessert a ajouter si vous n'en avez pas encore");
    expect(suggestions.map((item) => item.id)).not.toContain("main");
    expect(suggestions.map((item) => item.id)).not.toContain("drink");
  });
});
