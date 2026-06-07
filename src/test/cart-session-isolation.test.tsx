import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/lib/cart";
import { useCart } from "@/lib/cart-context";

const authMock = vi.hoisted(() => ({
  user: null as { id: string } | null,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: authMock.user,
    session: authMock.user ? { user: authMock.user } : null,
    loading: false,
    role: authMock.user ? "client" : null,
    roles: authMock.user ? ["client"] : [],
    isSuperAdmin: false,
    canSwitchRole: false,
    switchRole: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

function CartProbe() {
  const { items, addItem, cartMetadata, orderMode } = useCart();

  return (
    <div>
      <button
        type="button"
        onClick={() => addItem({
          menuItemId: "dish-1",
          name: "Plat confidentiel",
          price: 18,
          restaurantId: "restaurant-1",
          restaurantName: "Tok Test",
        })}
      >
        Ajouter
      </button>
      <div data-testid="items">{items.map((item) => item.name).join("|")}</div>
      <div data-testid="metadata">{JSON.stringify(cartMetadata)}</div>
      <div data-testid="mode">{orderMode}</div>
    </div>
  );
}

function renderCart() {
  return (
    <CartProvider>
      <CartProbe />
    </CartProvider>
  );
}

describe("cart session isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    authMock.user = { id: "user-1" };
  });

  it("clears in-memory and persisted cart state when the authenticated user signs out", async () => {
    const view = render(renderCart());

    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("Plat confidentiel"));
    expect(localStorage.getItem("miamz-cart")).toContain("Plat confidentiel");

    authMock.user = null;
    view.rerender(renderCart());

    await waitFor(() => expect(screen.getByTestId("items")).toBeEmptyDOMElement());
    expect(localStorage.getItem("miamz-cart")).toBe("[]");
    expect(localStorage.getItem("miamz-cart-metadata")).toBe("{}");
    expect(screen.getByTestId("metadata")).toHaveTextContent("{}");
    expect(screen.getByTestId("mode")).toHaveTextContent("delivery");
  });
});
