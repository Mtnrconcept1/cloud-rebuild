import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyWorkforceManager from "@/pages/workforce/MyWorkforceManager";

const restaurantA = "10000000-0000-4000-8000-000000000001";
const restaurantB = "10000000-0000-4000-8000-000000000002";
const restaurantUnknown = "10000000-0000-4000-8000-000000000099";
const employeeA = "20000000-0000-4000-8000-000000000001";
const employeeB = "20000000-0000-4000-8000-000000000002";
type Profile = { id: string; role: "manager" | "employee"; user_id: string; is_active: boolean };
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), toast: vi.fn(), profiles: {} as Record<string, Profile>, filters: [] as Record<string, string>[] }));
const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "current-user" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useTokWorkforce", () => ({
  workforceDb: () => ({ rpc: mocks.rpc, from: mocks.from }), useWorkforceRefresh: () => mocks.refresh,
  useWorkforceSettings: (restaurantId: string | null) => loaded(restaurantId ? { restaurant_id: restaurantId, enabled: true, canton: "GE", max_weekly_hours: 50, min_vacation_days: 20 } : undefined),
  useWorkforceEmployees: (restaurantId: string) => loaded([{ id: restaurantId === restaurantA ? employeeA : employeeB, restaurant_id: restaurantId, first_name: restaurantId === restaurantA ? "Alice" : "Bob", last_name: "Equipe", is_active: true, role: "manager", contracted_hours_per_week: 42, vacation_days_per_year: 20, started_on: "2020-01-01" }]),
  useWorkforceShifts: () => loaded([]), useWorkforceAbsences: () => loaded([]),
}));
vi.mock("@/components/dashboard/DashboardPageHero", () => ({ default: ({ title, actions }: { title: string; actions: ReactNode }) => <header><h1>{title}</h1>{actions}</header> }));
// Keep the real planning, service dialog, tabs and router. Other tabs are outside this route test.
vi.mock("@/components/workforce/WorkforceTime", () => ({ default: ({ restaurantId }: { restaurantId: string }) => <section aria-label="Heures du restaurant">{restaurantId}</section> }));
vi.mock("@/components/workforce/WorkforceAbsences", () => ({ default: () => null }));
vi.mock("@/components/workforce/WorkforceRequests", () => ({ default: () => null }));
vi.mock("@/components/workforce/WorkforceExchanges", () => ({ default: () => null }));
vi.mock("@/components/workforce/WorkforceReports", () => ({ default: () => null }));
vi.mock("@/components/workforce/WorkforceAnalytics", () => ({ default: () => null }));
vi.mock("@/components/workforce/WorkforceClockOverview", () => ({ default: () => null }));
vi.mock("@/components/workforce/WorkforceAssistant", () => ({ default: () => null }));
vi.mock("@/components/workforce/WorkforceSettingsPanel", () => ({ default: () => null }));
const clients: QueryClient[] = [];
function LocationProbe() { const location = useLocation(); return <output aria-label="Adresse actuelle">{location.pathname + location.search}</output>; }
function open(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/equipe/gestion" + search]}><LocationProbe /><Routes><Route path="/equipe/gestion" element={<MyWorkforceManager />} /><Route path="/equipe/mon-espace" element={<p>Espace personnel</p>} /></Routes></MemoryRouter></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.filters.length = 0;
  mocks.profiles = {
    [restaurantA]: { id: employeeA, role: "employee", user_id: "current-user", is_active: true },
    [restaurantB]: { id: employeeB, role: "manager", user_id: "current-user", is_active: true },
  };
  mocks.rpc.mockResolvedValue({ data: [
    { restaurant_id: restaurantA, employee_id: employeeA, restaurant_name: "Restaurant A", linked: true },
    { restaurant_id: restaurantB, employee_id: employeeB, restaurant_name: "Restaurant B", linked: true },
  ], error: null });
  mocks.from.mockImplementation(() => {
    const filters: Record<string, string> = {}; mocks.filters.push(filters);
    const query = { select: vi.fn(() => query), eq: vi.fn((field: string, value: string) => { filters[field] = value; return query; }), single: vi.fn(async () => ({ data: mocks.profiles[filters.restaurant_id], error: null })) };
    return query;
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("espace responsable TOK et sélection d’établissement", () => {
  it("permet de choisir le restaurant où le salarié est responsable après le refus du premier", async () => {
    open();
    expect(await screen.findByText("Accès responsable non autorisé")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter un service", exact: true })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Choisir un restaurant" }), { target: { value: restaurantB } });
    expect(await screen.findByRole("button", { name: "Ajouter un service", exact: true })).toBeEnabled();
    expect(screen.getByLabelText("Adresse actuelle")).toHaveTextContent("/equipe/gestion?restaurant=" + restaurantB);
    expect(screen.getByRole("link", { name: "Mon espace salarié" })).toHaveAttribute("href", "/equipe/mon-espace?restaurant=" + restaurantB);
    expect(mocks.filters).toEqual([
      { id: employeeA, restaurant_id: restaurantA, user_id: "current-user" },
      { id: employeeB, restaurant_id: restaurantB, user_id: "current-user" },
    ]);
  });

  it("préserve le restaurant explicite dans l’URL sans consulter le premier profil", async () => {
    open("?restaurant=" + restaurantB);
    expect(await screen.findByRole("button", { name: "Ajouter un service", exact: true })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Choisir un restaurant" })).toHaveValue(restaurantB);
    expect(screen.getByLabelText("Adresse actuelle")).toHaveTextContent("/equipe/gestion?restaurant=" + restaurantB);
    expect(mocks.filters).toEqual([{ id: employeeB, restaurant_id: restaurantB, user_id: "current-user" }]);
    expect(screen.queryByText("Accès responsable non autorisé")).not.toBeInTheDocument();
  });

  it.each([
    "?restaurant=invalid", "?restaurant=", "?restaurant=" + restaurantUnknown,
    "?restaurant=" + restaurantA + "&restaurant=" + restaurantB,
    "?restaurant=" + restaurantB + "&next=/admin",
  ])("n’utilise aucun restaurant de repli pour un lien invalide ou inaccessible : %s", async search => {
    open(search);
    await screen.findByRole("option", { name: "Restaurant B" });
    expect(await screen.findByText("Accès responsable non autorisé")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choisir un restaurant" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Ajouter un service", exact: true })).not.toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Adresse actuelle")).toHaveTextContent("/equipe/gestion" + search);
    fireEvent.change(screen.getByRole("combobox", { name: "Choisir un restaurant" }), { target: { value: restaurantB } });
    expect(await screen.findByRole("button", { name: "Ajouter un service", exact: true })).toBeEnabled();
    expect(mocks.filters).toEqual([{ id: employeeB, restaurant_id: restaurantB, user_id: "current-user" }]);
  });

  it("réinitialise le dialogue de service et l’onglet quand le restaurant change, même avec les droits en cache", async () => {
    mocks.profiles[restaurantA].role = "manager";
    const client = open("?restaurant=" + restaurantA);
    await screen.findByRole("button", { name: "Ajouter un service", exact: true });
    client.setQueryData(["workforce-manager-profile", restaurantB, employeeB, "current-user"], mocks.profiles[restaurantB]);
    const chooser = screen.getByRole("combobox", { name: "Choisir un restaurant" });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un service", exact: true }));
    fireEvent.change(screen.getByLabelText("Notes du service"), { target: { value: "Brouillon confidentiel du restaurant A" } });
    fireEvent.change(chooser, { target: { value: restaurantB } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Planning", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Adresse actuelle")).toHaveTextContent("?restaurant=" + restaurantB);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un service", exact: true }));
    expect(screen.getByLabelText("Notes du service")).toHaveValue("");
    expect(within(screen.getByRole("dialog")).getByRole("option", { name: "Bob Equipe" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByRole("option", { name: "Alice Equipe" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler", exact: true }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Heures", exact: true }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("region", { name: "Heures du restaurant" })).toHaveTextContent(restaurantB);
    fireEvent.change(chooser, { target: { value: restaurantA } });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Planning", exact: true })).toHaveAttribute("aria-selected", "true"));
    expect(screen.queryByRole("region", { name: "Heures du restaurant" })).not.toBeInTheDocument();
  });
});
