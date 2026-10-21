import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), eq: vi.fn(), limit: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/pages/dashboard/useDashboardRestaurant", () => ({
  useDashboardRestaurant: () => ({ selectedId: "restaurant-1", restaurants: [{ id: "restaurant-1", name: "Café Nord" }], loading: false, error: null, disabledFeatures: new Set() }),
}));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/dashboard/DashboardPageHero", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/dashboard/DirectReservationChannelsCard", () => ({ default: () => null }));
vi.mock("@/components/RestaurantCancellationDialog", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useNotificationCenter", () => ({ useNotificationCenter: () => ({ unreadNotifications: [] }) }));
vi.mock("@/components/list/SortControls", () => ({ default: () => null }));

// Use native filters to exercise the page's date/service/status/search data flow;
// the actual Calendar remains mounted and handles its own month and day events.
vi.mock("@/components/ui/select", async () => {
  const { Children, isValidElement } = await import("react");
  return {
    Select: ({ value, onValueChange, children }: any) => {
      const trigger = Children.toArray(children).find((child) => isValidElement<{ "aria-label"?: string }>(child) && child.props["aria-label"]);
      return <select aria-label={isValidElement<{ "aria-label"?: string }>(trigger) ? trigger.props["aria-label"] : undefined} value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>;
    },
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
    SelectTrigger: () => null,
    SelectValue: () => null,
  };
});

import DashboardReservations from "@/pages/dashboard/DashboardReservations";

const reservations = [
  { id: "may-lunch", user_id: "alice", date: "2026-05-31", time: "12:00:00", status: "confirmed", order_reference: "MAY-LUNCH", metadata: { service: "lunch" } },
  { id: "june-lunch", user_id: "alice", date: "2026-06-01", time: "12:00:00", status: "confirmed", order_reference: "JUNE-LUNCH", metadata: { service: "lunch" } },
  { id: "june-dinner", user_id: "alice", date: "2026-06-01", time: "19:00:00", status: "confirmed", order_reference: "JUNE-DINNER", metadata: { service: "dinner" } },
  { id: "june-pending", user_id: "alice", date: "2026-06-01", time: "12:30:00", status: "pending", order_reference: "JUNE-PENDING", metadata: { service: "lunch" } },
  { id: "june-bob", user_id: "bob", date: "2026-06-01", time: "12:45:00", status: "confirmed", order_reference: "JUNE-BOB", metadata: { service: "lunch" } },
  { id: "next-day", user_id: "bob", date: "2026-06-02", time: "12:00:00", status: "confirmed", order_reference: "NEXT-DAY", metadata: { service: "lunch" } },
  { id: "unpaid", user_id: "alice", date: "2026-06-01", time: "12:00:00", status: "pending_payment", order_reference: "UNPAID", metadata: { service: "lunch" } },
].map((reservation) => ({ ...reservation, restaurant_id: "restaurant-1", party_size: 2, notes: null, payment_status: "unpaid", total_amount: 0, created_at: "2026-05-01T12:00:00Z" }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><DashboardReservations /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 4, 27, 12));
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [{ user_id: "alice", full_name: "Alice Client", phone: null }, { user_id: "bob", full_name: "Bob Client", phone: null }], error: null });
  mocks.from.mockImplementation((table: string) => {
    const query: any = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string, value: unknown) => { mocks.eq(table, column, value); return query; });
    query.order = vi.fn(() => query);
    query.limit = vi.fn((limit: number) => { mocks.limit(table, limit); return Promise.resolve({ data: table === "reservations" ? reservations : [], error: null }); });
    return query;
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("restaurant reservation calendar", () => {
  it("selects a local day across a month boundary without changing the scoped query", async () => {
    renderPage();
    const calendar = within(screen.getByRole("complementary", { name: "Calendrier des réservations" }));
    await screen.findByRole("button", { name: /mardi 2 juin 2026.*2 couverts/i });

    fireEvent.click(calendar.getByRole("gridcell", { name: "31", exact: true }));
    expect(await screen.findByText("MAY-LUNCH")).toBeInTheDocument();
    expect(screen.getByLabelText("Date de référence des réservations")).toHaveValue("2026-05-31");
    expect(screen.getByLabelText("Période des réservations")).toHaveValue("day");
    expect(screen.queryByText("JUNE-LUNCH")).not.toBeInTheDocument();

    fireEvent.click(calendar.getByLabelText("Mois suivant"));
    expect(screen.getByLabelText("Date de référence des réservations")).toHaveValue("2026-05-31");
    fireEvent.click(calendar.getAllByRole("gridcell", { name: "1", exact: true }).find((day) => !day.classList.contains("day-outside"))!);
    expect(await screen.findByText("JUNE-LUNCH")).toBeInTheDocument();
    expect(screen.queryByText("MAY-LUNCH")).not.toBeInTheDocument();
    expect(screen.queryByText("NEXT-DAY")).not.toBeInTheDocument();
    expect(screen.queryByText("UNPAID")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date de référence des réservations")).toHaveValue("2026-06-01");

    fireEvent.click(calendar.getByRole("button", { name: "Toutes les dates" }));
    expect(screen.getByLabelText("Période des réservations")).toHaveValue("all");
    expect(await screen.findByRole("button", { name: /mardi 2 juin 2026.*2 couverts/i })).toBeInTheDocument();
    expect(mocks.from.mock.calls.filter(([table]) => table === "reservations")).toHaveLength(1);
    expect(mocks.eq).toHaveBeenCalledWith("reservations", "restaurant_id", "restaurant-1");
    expect(mocks.limit).toHaveBeenCalledWith("reservations", 300);
  });

  it("preserves search, service and status filters, and follows the existing date input", async () => {
    renderPage();
    await screen.findByRole("button", { name: /mardi 2 juin 2026.*2 couverts/i });
    fireEvent.change(screen.getByPlaceholderText("N° réservation, client..."), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Service des réservations"), { target: { value: "lunch" } });
    fireEvent.change(screen.getByLabelText("Statut des réservations"), { target: { value: "confirmed" } });
    fireEvent.change(screen.getByLabelText("Date de référence des réservations"), { target: { value: "2026-06-01" } });

    const calendar = within(screen.getByRole("complementary", { name: "Calendrier des réservations" }));
    fireEvent.click(calendar.getAllByRole("gridcell", { name: "1", exact: true }).find((day) => !day.classList.contains("day-outside"))!);
    expect(await screen.findByText("JUNE-LUNCH")).toBeInTheDocument();
    for (const reference of ["JUNE-DINNER", "JUNE-PENDING", "JUNE-BOB", "MAY-LUNCH", "NEXT-DAY", "UNPAID"]) {
      expect(screen.queryByText(reference)).not.toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText("N° réservation, client...")).toHaveValue("Alice");
    expect(screen.getByLabelText("Service des réservations")).toHaveValue("lunch");
    expect(screen.getByLabelText("Statut des réservations")).toHaveValue("confirmed");

    fireEvent.click(screen.getByLabelText("Afficher en liste"));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(within(screen.getByRole("article")).getByText("Alice Client")).toBeInTheDocument();
    expect(screen.queryByText("Aucune réservation pour les filtres sélectionnés.")).not.toBeInTheDocument();

    fireEvent.click(calendar.getByRole("button", { name: "Aujourd’hui" }));
    await waitFor(() => expect(screen.getByLabelText("Date de référence des réservations")).toHaveValue("2026-05-27"));
    expect(screen.getByLabelText("Période des réservations")).toHaveValue("day");
    expect(screen.getByText("Aucune réservation pour les filtres sélectionnés.")).toBeInTheDocument();
  });
});
