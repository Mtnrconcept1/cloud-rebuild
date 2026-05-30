import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Abonnement from "@/pages/Abonnement";

const cartMocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  clearCart: vi.fn(),
  replaceCartItems: vi.fn(),
  setOrderMode: vi.fn(),
  updateCartMetadata: vi.fn(),
}));

const subscriptionRows = vi.hoisted(() => ({
  rows: [
    {
      id: "slot-1",
      day_of_week: "Lundi",
      menu_item_id: "item-1",
      restaurant_id: "restaurant-1",
      preferred_time: "12:00",
      menu_items: { id: "item-1", name: "Plat abonne", price: 16 },
      restaurants: { id: "restaurant-1", name: "Tok Test" },
    },
  ],
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "client@example.com" },
  }),
}));

vi.mock("@/lib/cart", () => ({
  useCart: () => ({
    addItem: cartMocks.addItem,
    clearCart: cartMocks.clearCart,
    replaceCartItems: cartMocks.replaceCartItems,
    setOrderMode: cartMocks.setOrderMode,
    updateCartMetadata: cartMocks.updateCartMetadata,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: (table: string) => createSupabaseTableMock(table),
  }),
}));

function createSupabaseTableMock(table: string) {
  if (table === "user_subscriptions") {
    return {
      select: () => ({
        eq: () => Promise.resolve({
          data: [
            ...subscriptionRows.rows,
          ],
          error: null,
        }),
      }),
      upsert: vi.fn(),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      delete: vi.fn(),
    };
  }

  if (table === "user_meal_subscription_settings") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { status: "active", resume_at: null },
            error: null,
          }),
        }),
      }),
      upsert: vi.fn(),
    };
  }

  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  };
}

function renderAbonnement() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/abonnement"]}>
        <Routes>
          <Route path="/abonnement" element={<Abonnement />} />
          <Route path="/panier" element={<div>Panier cible</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Abonnement cart sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cartMocks.setOrderMode.mockReturnValue(false);
    subscriptionRows.rows = [
      {
        id: "slot-1",
        day_of_week: "Lundi",
        menu_item_id: "item-1",
        restaurant_id: "restaurant-1",
        preferred_time: "12:00",
        menu_items: { id: "item-1", name: "Plat abonne", price: 16 },
        restaurants: { id: "restaurant-1", name: "Tok Test" },
      },
    ];
  });

  it("rebuilds the cart from an existing active subscription before opening the cart", async () => {
    renderAbonnement();

    const cartButton = await screen.findByRole("button", { name: /Voir le panier/i });
    fireEvent.click(cartButton);

    await waitFor(() => expect(screen.getByText("Panier cible")).toBeInTheDocument());

    expect(cartMocks.replaceCartItems).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          menuItemId: "item-1",
          name: "[Lundi] Plat abonne",
          price: 16,
          restaurantId: "restaurant-1",
          restaurantName: "Tok Test",
          metadata: expect.objectContaining({
            is_meal_subscription: true,
            subscription_day: "Lundi",
            preferred_time: "12:00",
          }),
        }),
      ],
      expect.objectContaining({
        feature: "abonnement",
        multi_restaurant: false,
        restaurant_count: 1,
        weeklyTotal: 16,
        planDays: ["Lundi"],
        subscription_status: "active",
      }),
      "delivery",
    );
  });

  it("syncs several subscription meals from different restaurants into one multi-restaurant cart", async () => {
    subscriptionRows.rows = [
      {
        id: "slot-1",
        day_of_week: "Lundi",
        menu_item_id: "item-1",
        restaurant_id: "restaurant-1",
        preferred_time: "12:00",
        menu_items: { id: "item-1", name: "Plat abonne", price: 16 },
        restaurants: { id: "restaurant-1", name: "Tok Test" },
      },
      {
        id: "slot-2",
        day_of_week: "Mardi",
        menu_item_id: "item-2",
        restaurant_id: "restaurant-2",
        preferred_time: "12:30",
        menu_items: { id: "item-2", name: "Bol veggie", price: 18 },
        restaurants: { id: "restaurant-2", name: "Green Test" },
      },
    ];

    renderAbonnement();

    const cartButton = await screen.findByRole("button", { name: /Voir le panier/i });
    expect(screen.getByText(/2 repas\/semaine - 2 restaurants - 34\.00 CHF/i)).toBeInTheDocument();
    fireEvent.click(cartButton);

    await waitFor(() => expect(screen.getByText("Panier cible")).toBeInTheDocument());

    expect(cartMocks.replaceCartItems).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          menuItemId: "item-1",
          restaurantId: "restaurant-1",
          restaurantName: "Tok Test",
        }),
        expect.objectContaining({
          menuItemId: "item-2",
          restaurantId: "restaurant-2",
          restaurantName: "Green Test",
        }),
      ]),
      expect.objectContaining({
        feature: "abonnement",
        multi_restaurant: true,
        restaurant_count: 2,
        weeklyTotal: 34,
        planDays: ["Lundi", "Mardi"],
      }),
      "delivery",
    );
  });

  it("syncs several meals from the same restaurant on the same day", async () => {
    subscriptionRows.rows = [
      {
        id: "slot-1",
        day_of_week: "Lundi",
        menu_item_id: "item-1",
        restaurant_id: "restaurant-1",
        preferred_time: "12:00",
        menu_items: { id: "item-1", name: "Plat abonne", price: 16 },
        restaurants: { id: "restaurant-1", name: "Tok Test" },
      },
      {
        id: "slot-2",
        day_of_week: "Lundi",
        menu_item_id: "item-2",
        restaurant_id: "restaurant-1",
        preferred_time: "12:00",
        menu_items: { id: "item-2", name: "Dessert abonne", price: 8 },
        restaurants: { id: "restaurant-1", name: "Tok Test" },
      },
    ];

    renderAbonnement();

    const cartButton = await screen.findByRole("button", { name: /Voir le panier/i });
    expect(screen.getByText(/2 repas\/semaine - 1 restaurant - 24\.00 CHF/i)).toBeInTheDocument();
    fireEvent.click(cartButton);

    await waitFor(() => expect(screen.getByText("Panier cible")).toBeInTheDocument());

    expect(cartMocks.replaceCartItems).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          menuItemId: "item-1",
          restaurantId: "restaurant-1",
          metadata: expect.objectContaining({ subscription_slot_id: "slot-1", subscription_day: "Lundi" }),
        }),
        expect.objectContaining({
          menuItemId: "item-2",
          restaurantId: "restaurant-1",
          metadata: expect.objectContaining({ subscription_slot_id: "slot-2", subscription_day: "Lundi" }),
        }),
      ]),
      expect.objectContaining({
        feature: "abonnement",
        multi_restaurant: false,
        restaurant_count: 1,
        weeklyTotal: 24,
        planDays: ["Lundi"],
      }),
      "delivery",
    );
  });

  it("lets the customer change the delivery time for all meals of a day", async () => {
    subscriptionRows.rows = [
      {
        id: "slot-1",
        day_of_week: "Lundi",
        menu_item_id: "item-1",
        restaurant_id: "restaurant-1",
        preferred_time: "12:00",
        menu_items: { id: "item-1", name: "Plat abonne", price: 16 },
        restaurants: { id: "restaurant-1", name: "Tok Test" },
      },
      {
        id: "slot-2",
        day_of_week: "Lundi",
        menu_item_id: "item-2",
        restaurant_id: "restaurant-1",
        preferred_time: "12:00",
        menu_items: { id: "item-2", name: "Dessert abonne", price: 8 },
        restaurants: { id: "restaurant-1", name: "Tok Test" },
      },
    ];

    renderAbonnement();

    fireEvent.click(await screen.findByRole("button", { name: /Lundi/i }));
    fireEvent.change(screen.getByLabelText("Heure de livraison Lundi"), { target: { value: "12:45" } });
    fireEvent.click(screen.getByRole("button", { name: /Voir le panier/i }));

    await waitFor(() => expect(screen.getByText("Panier cible")).toBeInTheDocument());

    expect(cartMocks.replaceCartItems).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          menuItemId: "item-1",
          metadata: expect.objectContaining({ preferred_time: "12:45", delivery_time: "12:45" }),
        }),
        expect.objectContaining({
          menuItemId: "item-2",
          metadata: expect.objectContaining({ preferred_time: "12:45", delivery_time: "12:45" }),
        }),
      ]),
      expect.any(Object),
      "delivery",
    );
  });
});
