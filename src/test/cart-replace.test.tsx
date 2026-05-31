import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/lib/cart";
import { useCart } from "@/lib/cart-context";

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

function CartProbe() {
  const { items, addItem, replaceCartItems, cartMetadata, orderMode, conflict } = useCart();

  return (
    <div>
      <button
        type="button"
        onClick={() => addItem({
          menuItemId: "old-item",
          name: "Ancien panier",
          price: 10,
          restaurantId: "old-restaurant",
          restaurantName: "Old",
        })}
      >
        Ajouter ancien
      </button>
      <button
        type="button"
        onClick={() => replaceCartItems(
          [
            {
              menuItemId: "new-item",
              name: "[Lundi] Plat abonne",
              price: 16,
              restaurantId: "new-restaurant",
              restaurantName: "Tok Test",
              metadata: { subscription_day: "Lundi", preferred_time: "12:00" },
            },
          ],
          {
            feature: "abonnement",
            weeklyTotal: 16,
            planDays: ["Lundi"],
          },
          "delivery",
        )}
      >
        Remplacer
      </button>
      <button
        type="button"
        onClick={() => replaceCartItems(
          [
            {
              menuItemId: "sub-item-1",
              name: "[Lundi] Plat abonne",
              price: 16,
              restaurantId: "restaurant-1",
              restaurantName: "Tok Test 1",
              metadata: { subscription_day: "Lundi", preferred_time: "12:00" },
            },
          ],
          {
            feature: "abonnement",
            weeklyTotal: 16,
            planDays: ["Lundi"],
            multi_restaurant: true,
          },
          "delivery",
        )}
      >
        Remplacer abonnement
      </button>
      <button
        type="button"
        onClick={() => addItem({
          menuItemId: "sub-item-2",
          name: "[Mardi] Plat abonne autre resto",
          price: 18,
          restaurantId: "restaurant-2",
          restaurantName: "Tok Test 2",
          metadata: { subscription_day: "Mardi", preferred_time: "12:00" },
        })}
      >
        Ajouter autre resto abonnement
      </button>
      <div data-testid="items">{items.map((item) => item.name).join("|")}</div>
      <div data-testid="metadata">{JSON.stringify(cartMetadata)}</div>
      <div data-testid="mode">{orderMode}</div>
      <div data-testid="conflict">{conflict?.type || "none"}</div>
    </div>
  );
}

describe("CartProvider replaceCartItems", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("atomically replaces an existing cart with subscription items from another restaurant", async () => {
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ajouter ancien" }));
    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("Ancien panier"));

    fireEvent.click(screen.getByRole("button", { name: "Remplacer" }));

    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("[Lundi] Plat abonne"));
    expect(screen.getByTestId("items")).not.toHaveTextContent("Ancien panier");
    expect(screen.getByTestId("metadata")).toHaveTextContent('"feature":"abonnement"');
    expect(screen.getByTestId("mode")).toHaveTextContent("delivery");
  });

  it("allows an abonnement cart to keep meals from multiple restaurants", async () => {
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remplacer abonnement" }));
    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("[Lundi] Plat abonne"));

    fireEvent.click(screen.getByRole("button", { name: "Ajouter autre resto abonnement" }));

    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("[Mardi] Plat abonne autre resto"));
    expect(screen.getByTestId("items")).toHaveTextContent("[Lundi] Plat abonne");
    expect(screen.getByTestId("conflict")).toHaveTextContent("none");
  });
});
