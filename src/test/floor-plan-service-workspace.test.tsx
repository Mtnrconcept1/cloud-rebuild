import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPlanSalle from "@/pages/dashboard/DashboardPlanSalle";
import { DashboardContext, type DashboardContextValue } from "@/pages/dashboard/useDashboardRestaurant";
import type { buildFloorPlanWorkspaceRequest, FloorPlanWorkspaceSaveResult } from "@/lib/floorPlanWorkspacePersistence";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({
  useCommercialDemoFrame: () => null,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

type FixtureRow = Record<string, unknown>;
type QueryResult = { data: FixtureRow[] | FixtureRow | null; error: { message: string } | null };
type WorkspaceRequest = ReturnType<typeof buildFloorPlanWorkspaceRequest>;
type FixtureState = {
  rows: Record<string, FixtureRow[]>;
  readErrors: Map<string, string>;
  workspaceError: string | null;
  loseNextWorkspaceResponse: boolean;
  workspaceReplies: Map<string, FloorPlanWorkspaceSaveResult>;
  workspaceResponse: ((request: WorkspaceRequest) => Promise<QueryResult>) | null;
  createdTableCount: number;
  statusResponse: (() => Promise<QueryResult>) | null;
};

const SERVICE_DATE = "2026-10-19";
const SAVE_WORKSPACE_RPC = "restaurant_save_floor_plan_workspace_v3";
const clients: QueryClient[] = [];
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
let fixture: FixtureState;

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeReservation(id: string, userId: string, overrides: FixtureRow = {}): FixtureRow {
  return {
    id,
    user_id: userId,
    restaurant_id: "restaurant-a",
    branch_id: "branch-a",
    table_id: null,
    date: SERVICE_DATE,
    time: "19:00:00",
    party_size: 2,
    status: "confirmed",
    feature: "reservation",
    notes: null,
    special_requests: null,
    metadata: { duration_minutes: 120 },
    created_at: "2026-10-18T12:00:00Z",
    updated_at: "2026-10-18T12:00:00Z",
    confirmed_at: "2026-10-18T12:00:00Z",
    ...overrides,
  };
}

function makeTable(id: string, number: string, x: number): FixtureRow {
  return {
    id,
    branch_id: "branch-a",
    table_number: number,
    capacity: 4,
    is_active: true,
    sector: "Salle principale",
    layout: { x, y: 120, w: 220, h: 190, rotation: 0, shape: "rect", kind: "table", seatLabels: [1, 1, 1, 1] },
  };
}

function createFixture(): FixtureState {
  return {
    rows: {
      restaurants: [{ id: "restaurant-a", name: "Restaurant des tests", address: "Rue fictive 1", city: "Genève", postal_code: "1200", country: "Suisse" }],
      restaurant_branches: [{ id: "branch-a", restaurant_id: "restaurant-a", name: "Salle principale", is_active: true, created_at: "2026-10-01T12:00:00Z" }],
      reservation_tables: [makeTable("table-a1", "T1", 120), makeTable("table-a2", "T2", 440)],
      reservations: [
        makeReservation("alice", "customer-alice", { table_id: "table-a1", status: "seated" }),
        makeReservation("bob", "customer-bob", { party_size: 4 }),
      ],
      reservation_slots: [{ id: "slot-alice", reservation_id: "alice", table_id: "table-a1", created_at: "2026-10-18T12:00:00Z" }],
      reservation_table_layout_overrides: [],
      floor_plan_variants: [],
      restaurant_preferred_tables: [],
    },
    readErrors: new Map(),
    workspaceError: null,
    loseNextWorkspaceResponse: false,
    workspaceReplies: new Map(),
    workspaceResponse: null,
    createdTableCount: 0,
    statusResponse: null,
  };
}

/** A deterministic data boundary; React Query and every floor-plan component remain real. */
function createQuery(table: string) {
  const filters: Array<(row: FixtureRow) => boolean> = [];
  let single = false;
  let offset = 0;
  let limit = Number.POSITIVE_INFINITY;

  const execute = (): QueryResult => {
    if (!(table in fixture.rows)) throw new Error(`Unexpected fixture table: ${table}`);
    const error = fixture.readErrors.get(table);
    if (error) return { data: null, error: { message: error } };
    const matches = (row: FixtureRow) => filters.every((filter) => filter(row));
    const rows = fixture.rows[table].filter(matches).slice(offset, offset + limit);
    return { data: copy(single ? rows[0] ?? null : rows), error: null };
  };

  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
    in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
    gte: (key: string, value: string) => { filters.push((row) => String(row[key]) >= value); return query; },
    lt: (key: string, value: string) => { filters.push((row) => String(row[key]) < value); return query; },
    order: () => query,
    limit: (count: number) => { limit = count; return query; },
    range: (first: number, last: number) => { offset = first; limit = last - first + 1; return query; },
    single: () => { single = true; return query; },
    then: (resolve: (result: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => (
      Promise.resolve().then(execute).then(resolve, reject)
    ),
  };
  return query;
}

/** Models successful RPC responses, including a server commit whose response is lost. */
function saveWorkspace(request: WorkspaceRequest): QueryResult {
  const replay = fixture.workspaceReplies.get(request.p_request_id);
  if (replay) return { data: copy({ ...replay, replayed: true }), error: null };
  if (fixture.workspaceError) return { data: null, error: { message: fixture.workspaceError } };

  const idMap: Record<string, string> = {};
  fixture.rows.reservation_tables = fixture.rows.reservation_tables.filter((row) => !request.p_delete_ids.includes(String(row.id)));
  for (const { client_id: clientId, id: persistedId, ...table } of request.p_upserts) {
    const id = persistedId || `table-created-${++fixture.createdTableCount}`;
    idMap[clientId] = id;
    const next = { ...table, id, branch_id: request.p_branch_id };
    const existing = fixture.rows.reservation_tables.findIndex((row) => row.id === id);
    if (existing === -1) fixture.rows.reservation_tables.push(next);
    else fixture.rows.reservation_tables[existing] = next;
  }
  for (const { table_id: tableId, layout } of request.p_layouts) {
    fixture.rows.reservation_table_layout_overrides = fixture.rows.reservation_table_layout_overrides.filter((row) => (
      row.reservation_table_id !== tableId || row.service_date !== request.p_service_date
    ));
    if (layout) fixture.rows.reservation_table_layout_overrides.push({
      id: `override-${tableId}`, reservation_table_id: tableId,
      branch_id: request.p_branch_id, service_date: request.p_service_date, layout,
    });
  }
  const assignments = Object.fromEntries(Object.entries(request.p_assignments).map(([reservationId, tableId]) => [
    reservationId, tableId ? idMap[tableId] || tableId : null,
  ]));
  Object.entries(assignments).forEach(([reservationId, tableId]) => {
    fixture.rows.reservation_slots = fixture.rows.reservation_slots.filter((row) => row.reservation_id !== reservationId);
    if (tableId) fixture.rows.reservation_slots.push({ id: `slot-${reservationId}`, reservation_id: reservationId, table_id: tableId });
    fixture.rows.reservations = fixture.rows.reservations.map((row) => row.id === reservationId ? { ...row, table_id: tableId } : row);
  });

  const snapshot = {
    tables: fixture.rows.reservation_tables
      .filter((row) => row.branch_id === request.p_branch_id)
      .map(({ id, table_number, capacity, is_active, sector, layout }) => ({ id, table_number, capacity, is_active, sector, layout }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    overrides: request.p_mode === "service" ? fixture.rows.reservation_table_layout_overrides
      .filter((row) => row.branch_id === request.p_branch_id && row.service_date === request.p_service_date)
      .map(({ reservation_table_id, layout }) => ({ reservation_table_id, layout })) : [],
    slots: fixture.rows.reservation_slots
      .filter((row) => Object.keys(assignments).includes(String(row.reservation_id)))
      .map(({ reservation_id, table_id }) => ({ reservation_id, table_id })),
  } as FloorPlanWorkspaceSaveResult["snapshot"];
  const result: FloorPlanWorkspaceSaveResult = {
    id_map: idMap, assignments, snapshot, request_id: request.p_request_id, replayed: false,
  };
  fixture.workspaceReplies.set(request.p_request_id, copy(result));
  if (fixture.loseNextWorkspaceResponse) {
    fixture.loseNextWorkspaceResponse = false;
    return { data: null, error: { message: "La réponse du serveur n’a pas été reçue." } };
  }
  return { data: copy(result), error: null };
}

async function handleRpc(name: string, params: Record<string, unknown>): Promise<QueryResult> {
  if (name === "get_reservation_customers") {
    return {
      data: [
        { user_id: "customer-alice", full_name: "Alice Dupont", phone: null },
        { user_id: "customer-bob", full_name: "Bob Martin", phone: null },
      ],
      error: null,
    };
  }
  if (name === SAVE_WORKSPACE_RPC) {
    return fixture.workspaceResponse ? fixture.workspaceResponse(params as WorkspaceRequest) : saveWorkspace(params as WorkspaceRequest);
  }
  if (name === "update_restaurant_reservation_status_safe" || name === "restaurant_seat_floor_plan_reservation") {
    const result = fixture.statusResponse
      ? await fixture.statusResponse()
      : { data: [{ updated: true }], error: null };
    if (!result.error && Array.isArray(result.data) && result.data[0]?.updated) {
      fixture.rows.reservations = fixture.rows.reservations.map((row) => (
        row.id === params.p_reservation_id ? { ...row, status: name === "restaurant_seat_floor_plan_reservation" ? "seated" : params.p_status } : row
      ));
    }
    return result;
  }
  throw new Error(`Unexpected fixture RPC: ${name}`);
}

function RouteProbe() {
  const location = useLocation();
  return <output aria-label="Route du test">{location.pathname}{location.search}{location.hash}</output>;
}

function mountWorkspace({ initialPath = "/dashboard/plan-salle" } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const dashboard: DashboardContextValue = {
    restaurants: fixture.rows.restaurants as unknown as DashboardContextValue["restaurants"],
    selectedId: "restaurant-a",
    setSelectedId: vi.fn(),
    loading: false,
    error: null,
    disabledFeatures: new Set(),
    dashboardAccessLocked: false,
    onboardingConfigurationUnlocked: false,
    dashboardAccessLockReason: null,
    isDemoMode: false,
  };
  const renderRestaurant = (selectedId: string) => (
    <MemoryRouter initialEntries={[initialPath]}>
      <RouteProbe />
      <QueryClientProvider client={client}>
        <DashboardContext.Provider value={{ ...dashboard, selectedId }}>
          <DashboardPlanSalle />
        </DashboardContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(renderRestaurant("restaurant-a"));
  return { client, ...view, switchRestaurant: (selectedId: string) => view.rerender(renderRestaurant(selectedId)) };
}

async function readyWorkspace() {
  const workspace = mountWorkspace();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^T1,/ })).not.toHaveAccessibleName("T1, Libre");
    expect(screen.getByRole("button", { name: /^T2,/ })).toHaveAccessibleName("T2, Libre");
  }, { timeout: 3000 });
  return workspace;
}

function addSecondRestaurant() {
  fixture.rows.restaurants.push({ ...fixture.rows.restaurants[0], id: "restaurant-b", name: "Second restaurant des tests" });
  fixture.rows.restaurant_branches.push({ ...fixture.rows.restaurant_branches[0], id: "branch-b", restaurant_id: "restaurant-b" });
  fixture.rows.reservation_tables.push({ ...makeTable("table-b1", "B1", 120), branch_id: "branch-b" });
}

function queue() {
  const element = document.getElementById("floor-plan-reservation-queue");
  if (!element) throw new Error("The reservation queue is missing");
  return within(element);
}

function closeContext() {
  const dialog = screen.queryByRole("dialog");
  if (dialog) fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
}

async function editTableName(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Modifier la salle" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sélectionner T1" }));
  fireEvent.change(await screen.findByDisplayValue("T1"), { target: { value: name } });
}

async function refreshQueries(client: QueryClient, queryKey: string[]) {
  await act(async () => {
    await client.invalidateQueries({ queryKey });
    // Query promises resolve before their scheduled observer notifications.
    // Flush those notifications so assertions inspect the updated screen.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  // Radix Select uses the browser scrolling API, which jsdom does not implement.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T16:00:00Z"));
  vi.clearAllMocks();
  fixture = createFixture();
  mocks.from.mockImplementation(createQuery);
  mocks.rpc.mockImplementation(handleRpc);
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  mocks.channel.mockReturnValue(channel);
  mocks.removeChannel.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("floor-plan service workspace", () => {
  it("filters the client queue without hiding occupied tables or changing room availability", async () => {
    await readyWorkspace();
    const occupiedName = screen.getByRole("button", { name: /^T1,/ }).getAttribute("aria-label");
    expect(screen.getByText(/Libres\s+1/)).toBeInTheDocument();

    expect(queue().getByText("Bob Martin")).toBeInTheDocument();
    fireEvent.change(queue().getByRole("textbox", { name: "Rechercher un client, une heure ou une table" }), { target: { value: "Client introuvable" } });

    await waitFor(() => expect(queue().queryByText("Bob Martin")).not.toBeInTheDocument());
    expect(queue().queryByText("Alice Dupont")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^T1,/ })).toHaveAccessibleName(occupiedName!);
    expect(screen.getByText(/Libres\s+1/)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith(SAVE_WORKSPACE_RPC, expect.anything());
  });

  it("preserves a local placement without overwriting another server assignment on retry", async () => {
    fixture.rows.reservation_tables.push(makeTable("table-a3", "T3", 720));
    const { client } = await readyWorkspace();
    fixture.workspaceError = "Sauvegarde temporairement indisponible.";
    fireEvent.click(queue().getByRole("button", { name: "Placer Bob Martin à T2" }));
    closeContext();
    // Keep a real unsaved draft after the automatic save has been refused.
    // This avoids racing its timer while the background refresh is exercised.
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive", description: fixture.workspaceError,
    })), { timeout: 3500 });

    // A colleague moves Alice while Bob's placement is still an unsaved draft.
    fixture.rows.reservation_slots[0].table_id = "table-a3";
    fixture.rows.reservations[0].table_id = "table-a3";
    await refreshQueries(client, ["floor-plan-slots"]);

    fireEvent.click(queue().getByRole("button", { name: /^Placés / }));
    expect(queue().getByRole("button", { name: "Retirer Bob Martin de T2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler", exact: true })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeEnabled();
    expect(screen.getByLabelText("Date du service")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualiser", exact: true })).toBeEnabled();

    fixture.workspaceError = null;
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled());

    const assignmentSaves = mocks.rpc.mock.calls.filter(([name]) => name === SAVE_WORKSPACE_RPC);
    expect(assignmentSaves.at(-1)?.[1]).toMatchObject({
      p_branch_id: "branch-a", p_mode: "service", p_service_date: SERVICE_DATE,
      p_expected_snapshot: { slots: [] },
    });
    expect(assignmentSaves.at(-1)?.[1].p_assignments).toEqual({ bob: "table-a2" });
    expect(fixture.rows.reservation_slots.find((row) => row.reservation_id === "alice")?.table_id).toBe("table-a3");
    expect(queue().getByRole("button", { name: "Retirer Alice Dupont de T3" })).toBeInTheDocument();
  });

  it("preserves a changed table and its undo history across a background table refresh", async () => {
    const { client } = await readyWorkspace();
    await editTableName("Fenêtre VIP");
    fixture.rows.reservation_tables[1].table_number = "T2 serveur";

    fireEvent.click(screen.getByRole("button", { name: "Actualiser", exact: true }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Actualiser", exact: true })).toBeEnabled();
      const tableQueries = client.getQueriesData<FixtureRow[]>({ queryKey: ["floor-plan-tables", "branch-a"] });
      expect(tableQueries[0]?.[1]).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "table-a2", table_number: "T2 serveur" }),
      ]));
    });

    expect(screen.getByDisplayValue("Fenêtre VIP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler", exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Annuler", exact: true }));
    expect(await screen.findByRole("button", { name: "Sélectionner T1" })).toBeInTheDocument();
  });

  it("retains the edited room after a failed save and allows a successful explicit retry", async () => {
    await readyWorkspace();
    await editTableName("Fenêtre VIP");
    fixture.workspaceError = "Connexion interrompue. Réessayez.";

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));

    const retry = await screen.findByRole("button", { name: "Réessayer", exact: true });
    expect(screen.getByDisplayValue("Fenêtre VIP")).toBeInTheDocument();
    expect(screen.queryByText("Aucun élément dans ce secteur")).not.toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));

    fixture.workspaceError = null;
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled());
    expect(fixture.rows.reservation_tables[0].table_number).toBe("Fenêtre VIP");
    expect(screen.getByRole("button", { name: "Terminer", exact: true })).toBeEnabled();
  });

  it("does not leave room editing when saving before the service view is refused", async () => {
    await readyWorkspace();
    await editTableName("Fenêtre VIP");
    fixture.workspaceError = "Enregistrement refusé par le serveur.";

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et terminer" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.getByDisplayValue("Fenêtre VIP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer et terminer" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: /Plan de service/ })).not.toBeInTheDocument();
  });

  it("retries a lost save response without creating the new table twice", async () => {
    await readyWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la salle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sélectionner T1" }));
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer", exact: true }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nom", exact: true }), { target: { value: "Terrasse 3" } });
    fixture.loseNextWorkspaceResponse = true;

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));

    const retry = await screen.findByRole("button", { name: "Réessayer", exact: true });
    expect(screen.getByDisplayValue("Terrasse 3")).toBeInTheDocument();
    expect(fixture.rows.reservation_tables.filter((row) => row.table_number === "Terrasse 3")).toHaveLength(1);
    const firstSave = mocks.rpc.mock.calls.find(([name]) => name === SAVE_WORKSPACE_RPC)?.[1] as WorkspaceRequest;
    expect(firstSave.p_request_id).toEqual(expect.any(String));
    expect(firstSave.p_request_id.length).toBeGreaterThan(0);
    expect(firstSave.p_upserts.filter((row) => row.id === null)).toHaveLength(1);

    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled());
    const saves = mocks.rpc.mock.calls.filter(([name]) => name === SAVE_WORKSPACE_RPC);
    expect(saves).toHaveLength(2);
    expect(saves[1][1]).toEqual(firstSave);
    expect(fixture.rows.reservation_tables.filter((row) => row.table_number === "Terrasse 3")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sélectionner Terrasse 3" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Réessayer", exact: true })).not.toBeInTheDocument();
  });

  it("keeps a pending save identity with its restaurant draft while another restaurant is edited", async () => {
    addSecondRestaurant();
    const workspace = await readyWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la salle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sélectionner T1" }));
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer", exact: true }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nom", exact: true }), { target: { value: "Terrasse 3" } });
    fixture.loseNextWorkspaceResponse = true;
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));
    await screen.findByRole("button", { name: "Réessayer", exact: true });
    const firstSave = mocks.rpc.mock.calls.find(([name]) => name === SAVE_WORKSPACE_RPC)?.[1] as WorkspaceRequest;

    workspace.switchRestaurant("restaurant-b");
    fireEvent.click(await screen.findByRole("button", { name: "Sélectionner B1" }, { timeout: 3000 }));
    expect(screen.queryByRole("button", { name: "Sélectionner Terrasse 3" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Nom", exact: true }), { target: { value: "Salon B" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled());
    expect(fixture.rows.reservation_tables.find((row) => row.id === "table-b1")?.table_number).toBe("Salon B");

    workspace.switchRestaurant("restaurant-a");
    await screen.findByRole("button", { name: "Sélectionner Terrasse 3" }, { timeout: 3000 });
    expect(screen.queryByRole("button", { name: "Sélectionner Salon B" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler", exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled());

    const restaurantASaves = mocks.rpc.mock.calls.filter(([name, params]) => name === SAVE_WORKSPACE_RPC && params.p_branch_id === "branch-a");
    expect(restaurantASaves).toHaveLength(2);
    expect(restaurantASaves[1][1]).toEqual(firstSave);
    expect(fixture.rows.reservation_tables.filter((row) => row.table_number === "Terrasse 3")).toHaveLength(1);
    expect(fixture.rows.reservation_tables.find((row) => row.id === "table-b1")?.table_number).toBe("Salon B");
  });

  it("opens the requested service date and clears its reservation focus when the date changes", async () => {
    fixture.rows.reservations.push(makeReservation("bob-tomorrow", "customer-bob", {
      date: "2026-10-20", table_id: "table-a2", status: "arrived",
    }));
    fixture.rows.reservation_slots.push({ id: "slot-bob-tomorrow", reservation_id: "bob-tomorrow", table_id: "table-a2" });
    mountWorkspace({ initialPath: "/dashboard/plan-salle?date=2026-10-20&branch=branch-a&reservation=bob-tomorrow" });

    const drawer = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(drawer).toHaveTextContent("Bob Martin");
    closeContext();
    expect(screen.getByLabelText("Date du service")).toHaveValue("2026-10-20");
    expect(screen.getByRole("button", { name: /^T1,/ })).toHaveAccessibleName("T1, Libre");
    expect(screen.getByRole("button", { name: /^T2,/ })).not.toHaveAccessibleName("T2, Libre");
    expect(queue().queryByText("Alice Dupont")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date du service"), { target: { value: SERVICE_DATE } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^T1,/ })).not.toHaveAccessibleName("T1, Libre");
      expect(screen.getByRole("button", { name: /^T2,/ })).toHaveAccessibleName("T2, Libre");
    }, { timeout: 3000 });
    expect(screen.getByLabelText("Date du service")).toHaveValue(SERVICE_DATE);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(queue().getByRole("button", { name: "Placer Bob Martin à T2" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith(SAVE_WORKSPACE_RPC, expect.anything());
  });

  it("does not navigate to a previous restaurant when its pending save completes", async () => {
    addSecondRestaurant();
    const workspace = await readyWorkspace();
    await editTableName("Fenêtre A");
    let respond: () => void = () => undefined;
    fixture.workspaceResponse = (request) => new Promise<QueryResult>((resolve) => {
      respond = () => resolve(saveWorkspace(request));
    });
    fireEvent.click(screen.getByRole("button", { name: "Réservations", exact: true }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(SAVE_WORKSPACE_RPC, expect.objectContaining({ p_branch_id: "branch-a" })));

    workspace.switchRestaurant("restaurant-b");
    await act(async () => { respond(); });

    expect(await screen.findByRole("button", { name: "Sélectionner B1" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByLabelText("Route du test")).toHaveTextContent(/^\/dashboard\/plan-salle$/);
    expect(fixture.rows.reservation_tables.find((row) => row.id === "table-a1")?.table_number).toBe("Fenêtre A");
    expect(fixture.rows.reservation_tables.find((row) => row.id === "table-b1")?.table_number).toBe("B1");
    expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled();
  });

  it("keeps an arrived and already honored guest occupying the table and installs them with the dedicated action", async () => {
    const honoredAt = "2026-10-19T15:30:00Z";
    fixture.rows.reservations[1] = { ...fixture.rows.reservations[1], status: "arrived", honored_at: honoredAt, table_id: "table-a2" };
    fixture.rows.reservation_slots.push({ id: "slot-bob", reservation_id: "bob", table_id: "table-a2" });
    mountWorkspace();
    expect(await screen.findByRole("button", { name: /^T2, Client arrivé/ }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/Libres\s+0/)).toBeInTheDocument();
    fireEvent.click(queue().getByRole("button", { name: /^Placés / }));
    fireEvent.click(queue().getByRole("button", { name: "Ouvrir la réservation de Bob Martin" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Installer", exact: true }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith("restaurant_seat_floor_plan_reservation", { p_reservation_id: "bob" });
      expect(fixture.rows.reservations.find((row) => row.id === "bob")).toMatchObject({ status: "seated", honored_at: honoredAt });
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith("update_restaurant_reservation_status_safe", { p_reservation_id: "bob", p_status: "seated" });
    closeContext();
    expect(screen.getByRole("button", { name: /^T2,/ })).not.toHaveAccessibleName("T2, Libre");
    expect(screen.getByText(/Libres\s+0/)).toBeInTheDocument();
  });

  it("loads a saved room layout without replacing surviving tables or clearing their reservations", async () => {
    fixture.rows.floor_plan_variants.push({
      id: "variant-dinner", branch_id: "branch-a", name: "Disposition dîner",
      snapshot: {
        version: 1, canvas: { width: 1200, height: 800 },
        tables: fixture.rows.reservation_tables.map(({ table_number, capacity, is_active, sector, layout }) => ({
          table_number, capacity, is_active, sector, layout: { ...(layout as FixtureRow), y: 240 },
        })),
      },
      created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-18T12:00:00Z",
    });
    await readyWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la salle" }));
    await screen.findByRole("button", { name: "Sélectionner T1" });
    const savedLayouts = screen.getAllByRole("combobox").find((select) => select.textContent === "Salle enregistrée");
    if (!savedLayouts) throw new Error("Saved room layout selector is missing");
    fireEvent.keyDown(savedLayouts, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "Disposition dîner" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et terminer" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Modifier la salle" })).toBeEnabled());
    const saved = mocks.rpc.mock.calls.find(([name]) => name === SAVE_WORKSPACE_RPC)?.[1] as WorkspaceRequest;
    expect(saved.p_delete_ids).toEqual([]);
    expect(saved.p_upserts.every((row) => row.id === row.client_id)).toBe(true);
    expect(saved.p_assignments).toEqual({});
    expect(fixture.rows.reservation_tables.map((row) => row.id)).toEqual(["table-a1", "table-a2"]);
    expect(fixture.rows.reservation_slots.find((row) => row.reservation_id === "alice")?.table_id).toBe("table-a1");
    expect(screen.getByRole("button", { name: /^T1,/ })).not.toHaveAccessibleName("T1, Libre");
  });

  it("respects an overlapping reservation from the previous day without rewriting its assignment", async () => {
    fixture.rows.reservations[0] = { ...fixture.rows.reservations[0], date: "2026-10-18", time: "23:30:00" };
    fixture.rows.reservations[1] = { ...fixture.rows.reservations[1], time: "00:30:00" };
    mountWorkspace();

    // Alice's two-hour stay crosses midnight and makes T1 unavailable to Bob.
    const placeBob = await screen.findByRole("button", { name: "Placer Bob Martin à T2" }, { timeout: 3000 });
    expect(queue().queryByRole("button", { name: "Placer Bob Martin à T1" })).not.toBeInTheDocument();
    expect(queue().queryByText("Alice Dupont")).not.toBeInTheDocument();
    fireEvent.click(placeBob);
    closeContext();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled());
    const saved = mocks.rpc.mock.calls.find(([name]) => name === SAVE_WORKSPACE_RPC)?.[1] as WorkspaceRequest;
    expect(saved.p_service_date).toBe(SERVICE_DATE);
    expect(saved.p_assignments).toEqual({ bob: "table-a2" });
    expect(saved.p_expected_snapshot.slots).toEqual([]);
    expect(fixture.rows.reservation_slots.find((row) => row.reservation_id === "alice")?.table_id).toBe("table-a1");
    expect(fixture.rows.reservation_slots.find((row) => row.reservation_id === "bob")?.table_id).toBe("table-a2");
  });

  it("updates the visible reservation optimistically and restores it when the status change is refused", async () => {
    let respond: (result: QueryResult) => void = () => undefined;
    fixture.statusResponse = () => new Promise<QueryResult>((resolve) => { respond = resolve; });
    const { client } = await readyWorkspace();
    fireEvent.click(queue().getByRole("button", { name: "Ouvrir la réservation de Bob Martin" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Client arrivé" }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith("update_restaurant_reservation_status_safe", {
        p_reservation_id: "bob", p_status: "arrived",
      });
      const queries = client.getQueriesData<FixtureRow[]>({ queryKey: ["floor-plan-reservations", "restaurant-a"] });
      const visibleReservations = queries.find(([key]) => key.includes(SERVICE_DATE))?.[1];
      expect(visibleReservations?.find((row) => row.id === "bob")?.status).toBe("arrived");
      expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Client arrivé" })).not.toBeInTheDocument();
    });

    await act(async () => {
      respond({ data: [{ updated: false, error_code: "stale_status", error_message: "Le statut a changé sur un autre appareil." }], error: null });
    });

    await waitFor(() => {
      const queries = client.getQueriesData<FixtureRow[]>({ queryKey: ["floor-plan-reservations", "restaurant-a"] });
      const visibleReservations = queries.find(([key]) => key.includes(SERVICE_DATE))?.[1];
      expect(visibleReservations?.find((row) => row.id === "bob")?.status).toBe("confirmed");
    });
    expect(screen.getByRole("dialog")).toHaveTextContent("Bob Martin");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Client arrivé" })).toBeEnabled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive", description: "Le statut a changé sur un autre appareil.",
    }));
  });

  it("offers retry for a failed room load without presenting it as a new empty restaurant", async () => {
    fixture.readErrors.set("restaurant_branches", "Impossible de joindre la base.");
    mountWorkspace();

    const retry = await screen.findByRole("button", { name: /R[ée]essayer/i });
    expect(retry).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Créer la salle" })).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun élément dans ce secteur")).not.toBeInTheDocument();

    fixture.readErrors.clear();
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^T1,/ })).not.toHaveAccessibleName("T1, Libre");
      expect(screen.getByRole("button", { name: /^T2,/ })).toHaveAccessibleName("T2, Libre");
    }, { timeout: 3000 });
    expect(queue().getByText("Bob Martin")).toBeInTheDocument();
  });
});
