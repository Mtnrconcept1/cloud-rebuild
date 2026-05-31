import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import SuiviCommande from "@/pages/SuiviCommande";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useRealtimeOrder", () => ({
  useRealtimeDeliveryTracking: () => ({ tracking: null }),
  useRealtimeDispatchJob: () => ({ dispatchJob: null }),
}));

vi.mock("@/components/DeliveryMap", () => ({
  default: ({ routeStops }: { routeStops: Array<{ label: string }> }) => (
    <div>
      Carte livraison
      {routeStops.map((stop) => <span key={stop.label}>{stop.label}</span>)}
    </div>
  ),
}));

vi.mock("@/components/OrderStatusBadge", () => ({
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("@/components/orders/DeliveryProofCard", () => ({
  default: () => null,
}));

vi.mock("@/components/orders/OrderPaymentBreakdown", () => ({
  default: () => null,
  getOrderPaymentBreakdown: (order: any) => ({
    total: Number(order.total_amount || 0),
    subtotal: Number(order.total_amount || 0),
    tokOneTotalSaved: 0,
  }),
}));

const orderRows = [
  {
    id: "order-1",
    checkout_id: "checkout-1",
    order_number: "ABO-1",
    created_at: "2026-06-01T08:00:00.000Z",
    status: "preparing",
    total_amount: 18,
    delivery_address: "Rue Client",
    metadata: {
      feature: "abonnement",
      checkout_group_id: "group-1",
      delivery_lat: 46.54,
      delivery_lng: 6.66,
      scheduled_delivery_label: "2026-06-01 a 12:00",
    },
    restaurants: {
      id: "resto-1",
      name: "Tok Test",
      address: "Rue A",
      city: "Geneve",
      latitude: 46.52,
      longitude: 6.64,
    },
  },
  {
    id: "order-2",
    checkout_id: "checkout-2",
    order_number: "ABO-2",
    created_at: "2026-06-01T08:05:00.000Z",
    status: "preparing",
    total_amount: 24,
    delivery_address: "Rue Client",
    metadata: {
      feature: "abonnement",
      checkout_group_id: "group-1",
      scheduled_delivery_label: "2026-06-01 a 12:00",
    },
    restaurants: {
      id: "resto-2",
      name: "Green Test",
      address: "Rue B",
      city: "Geneve",
      latitude: 46.53,
      longitude: 6.65,
    },
  },
];

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          single: () => Promise.resolve({ data: orderRows.find((order) => order.id === value), error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
        filter: () => Promise.resolve({ data: table === "orders" ? orderRows : [], error: null }),
      }),
    }),
  }),
}));

function renderTrackingPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/commande/order-1"]}>
        <Routes>
          <Route path="/commande/:id" element={<SuiviCommande />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("subscription tracking page", () => {
  it("shows the complete route for all restaurants in the subscription checkout group", async () => {
    renderTrackingPage();

    expect(await screen.findByText(/2 restaurants/i)).toBeInTheDocument();
    expect(screen.getByText(/42\.00\s*CHF/i)).toBeInTheDocument();
    expect(screen.getAllByText("Tok Test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Green Test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Retrait 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Retrait 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Livraison").length).toBeGreaterThan(0);
    expect(screen.getByText("Livraison planifiee : 2026-06-01 a 12:00")).toBeInTheDocument();
  });
});