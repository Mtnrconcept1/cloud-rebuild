import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    rpc: rpcMock,
  }),
}));

vi.mock("@/pages/dashboard/useDashboardRestaurant", () => ({
  useDashboardRestaurant: () => ({
    selectedId: "restaurant-1",
    restaurants: [{ id: "restaurant-1", name: "Cafe Nord", disabled_dashboard_features: [] }],
    loading: false,
    error: null,
    disabledFeatures: new Set(),
    setSelectedId: vi.fn(),
  }),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dashboard/DashboardPageHero", () => ({
  default: ({ title }: { title: React.ReactNode }) => <h1>{title}</h1>,
}));

vi.mock("@/components/DeliveryMap", () => ({
  default: () => <div>Carte livraison</div>,
}));

vi.mock("@/components/RestaurantCancellationDialog", () => ({
  default: () => null,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/lib/session", () => ({
  invokeSupabaseFunction: vi.fn(),
}));

vi.mock("@/lib/notificationDispatch", () => ({
  dispatchQueuedNotifications: vi.fn(),
}));

vi.mock("@/lib/refundMutations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/refundMutations")>("@/lib/refundMutations");

  return {
    ...actual,
    cancelOrderByRestaurant: vi.fn(),
    processRefund: vi.fn(),
  };
});

import DashboardCommandes from "@/pages/dashboard/DashboardCommandes";

function renderDashboardCommandes() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardCommandes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardCommandes day accordion", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-27T12:00:00"));

    rpcMock.mockResolvedValue({
      data: [
        {
          id: "order-1",
          user_id: "customer-1",
          restaurant_id: "restaurant-1",
          checkout_id: "checkout-1",
          order_number: "#CMD-1",
          created_at: "2026-05-27T10:15:00.000Z",
          status: "confirmed",
          payment_status: "paid",
          cancelled_by: null,
          cancelled_at: null,
          refund_status: null,
          refunded_amount_chf: null,
          total_amount: 18.5,
          delivery_fee: 0,
          delivery_address: null,
          notes: null,
          metadata: { payment_status: "paid" },
          customer: { full_name: "Alice Client", phone: "+41000000000" },
          order_items: [
            { id: "item-1", quantity: 1, name: "Burger maison", total_price: 18.5 },
          ],
          delivery_tracking: null,
          dispatch_job: null,
        },
        {
          id: "order-2",
          user_id: "customer-2",
          restaurant_id: "restaurant-1",
          checkout_id: "checkout-2",
          order_number: "#CMD-2",
          created_at: "2026-05-26T12:30:00.000Z",
          status: "confirmed",
          payment_status: "paid",
          cancelled_by: null,
          cancelled_at: null,
          refund_status: null,
          refunded_amount_chf: null,
          total_amount: 24,
          delivery_fee: 0,
          delivery_address: null,
          notes: null,
          metadata: { payment_status: "paid" },
          customer: { full_name: "Bob Client", phone: "+41000000001" },
          order_items: [
            { id: "item-2", quantity: 2, name: "Pizza verte", total_price: 24 },
          ],
          delivery_tracking: null,
          dispatch_job: null,
        },
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the opened day group to collapse without opening another day", async () => {
    renderDashboardCommandes();

    const openedDayTrigger = await screen.findByRole("button", { name: /mercredi 27 mai 2026/i });

    expect(await screen.findByText(/Burger maison/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pizza verte/i)).not.toBeInTheDocument();
    expect(openedDayTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(openedDayTrigger);

    await waitFor(() => {
      expect(screen.queryByText(/Burger maison/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Pizza verte/i)).not.toBeInTheDocument();
    expect(openedDayTrigger).toHaveAttribute("aria-expanded", "false");
  });
});
