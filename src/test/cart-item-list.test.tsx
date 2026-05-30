import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CartItemList from "@/components/cart/CartItemList";

describe("CartItemList", () => {
  it("shows restaurant and scheduled day details for meal subscription items", () => {
    render(
      <CartItemList
        items={[
          {
            menuItemId: "item-1",
            name: "[Lundi] Plat abonne",
            price: 16,
            quantity: 1,
            restaurantName: "Tok Test",
            metadata: { is_meal_subscription: true, subscription_day: "Lundi", preferred_time: "12:00" },
          },
          {
            menuItemId: "item-2",
            name: "[Mardi] Bol veggie",
            price: 18,
            quantity: 1,
            restaurantName: "Green Test",
            metadata: { is_meal_subscription: true, subscription_day: "Mardi", preferred_time: "12:30" },
          },
        ]}
        updateQuantity={vi.fn()}
        removeItem={vi.fn()}
      />,
    );

    expect(screen.getByText("Tok Test")).toBeInTheDocument();
    expect(screen.getByText("Green Test")).toBeInTheDocument();
    expect(screen.getByText("Lundi - livraison 12:00")).toBeInTheDocument();
    expect(screen.getByText("Mardi - livraison 12:30")).toBeInTheDocument();
  });
});
