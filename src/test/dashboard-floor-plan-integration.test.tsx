import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DashboardContext,
  type DashboardContextValue,
} from "@/pages/dashboard/useDashboardRestaurant";
import DashboardPlanSalle from "@/pages/dashboard/DashboardPlanSalle";
import {
  previewRestaurant,
  previewState,
  previewSupabase,
  resetFloorPlanPreview,
} from "./fixtures/floorPlanPreview";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { previewSupabase } = await import("./fixtures/floorPlanPreview");
  return { getSupabase: () => previewSupabase };
});
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({
  useCommercialDemoFrame: () => null,
}));
vi.mock("@/lib/session", () => ({
  invokeSupabaseFunction: async () => ({
    data: null,
    error: new Error("Appel externe interdit dans le test."),
  }),
}));
vi.mock("@/lib/commercialDemoAi", () => ({
  askCommercialDemoAi: vi.fn(),
  parseCommercialDemoAiJson: JSON.parse,
}));
vi.mock("@/lib/commercialDemoRestaurantTools", () => ({
  readCommercialDemoToolState: (
    _session: string,
    _key: string,
    fallback: unknown,
  ) => fallback,
  writeCommercialDemoToolState: vi.fn(),
}));
vi.mock("@/lib/commercialDemoJourney", () => ({
  transitionCommercialDemoReservation: vi.fn(),
}));

const context: DashboardContextValue = {
  selectedId: previewRestaurant.id,
  restaurants: [previewRestaurant],
  setSelectedId: vi.fn(),
  loading: false,
  error: null,
  disabledFeatures: new Set(),
  dashboardAccessLocked: false,
  onboardingConfigurationUnlocked: true,
  dashboardAccessLockReason: null,
  isDemoMode: false,
};
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

async function renderPage() {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <DashboardContext.Provider value={context}>
        <DashboardPlanSalle />
      </DashboardContext.Provider>
    </QueryClientProvider>,
  );
  await screen.findByRole(
    "button",
    { name: /^T01, Occupée/ },
    { timeout: 5000 },
  );
  return screen.getByRole("tablist", { name: "Vues du plan de salle" });
}

beforeEach(() => {
  resetFloorPlanPreview();
  toast.mockClear();
  fetchMock = vi.fn(() =>
    Promise.reject(
      new Error("Aucun réseau n’est autorisé dans ce test d’intégration."),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  client?.clear();
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("DashboardPlanSalle — vraie page, données mémoire", () => {
  it("navigates between service, arrangement and real space summaries", async () => {
    const navigation = await renderPage();
    expect(
      within(navigation).getByRole("tab", { name: "Service" }),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    );
    await screen.findByRole("region", {
      name: "Plan du secteur Salle principale",
    });
    expect(
      screen.getByRole("button", { name: "Sélectionner T02" }),
    ).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("tab", { name: "Espaces" }));
    const spaces = await screen.findByRole("region", {
      name: "Gestion des espaces",
    });
    expect(
      within(spaces).getByRole("heading", { name: "Vos espaces" }),
    ).toBeInTheDocument();
    expect(
      within(spaces).getByRole("button", {
        name: /Terrasse.*2 tables\s*·\s*6 couverts/,
      }),
    ).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("tab", { name: "Service" }));
    await screen.findByRole("region", {
      name: "Plan de service du secteur Salle principale",
    });
    expect(previewState.operations).toHaveLength(0);
  });

  it("searches the reservation queue without changing real table occupation", async () => {
    await renderPage();
    // The reservation time can cross the service cutoff while CI is running.
    // Assert that filtering preserves the actual status, whatever it is today.
    const initialTableState = screen.getByRole("button", { name: /^T03, / }).getAttribute("aria-label");
    expect(initialTableState).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Rechercher une réservation" }),
      { target: { value: "Léa" } },
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^Camille Martin,/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /^Léa Bernard,/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^T01, Occupée/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^T03, / }))
      .toHaveAttribute("aria-label", initialTableState);
    expect(previewState.operations).toHaveLength(0);
  });

  it("clears the previous room selection when opening another room through Spaces", async () => {
    const navigation = await renderPage();
    fireEvent.click(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Sélectionner T02" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Nom ou numéro de table" }),
    ).toHaveValue("T02");

    fireEvent.click(within(navigation).getByRole("tab", { name: "Espaces" }));
    const spaces = await screen.findByRole("region", {
      name: "Gestion des espaces",
    });
    fireEvent.click(
      within(spaces).getByRole("button", {
        name: /Terrasse.*2 tables\s*·\s*6 couverts/,
      }),
    );
    fireEvent.click(
      within(spaces).getByRole("button", { name: "Aménager", exact: true }),
    );
    await screen.findByRole("region", { name: "Plan du secteur Terrasse" });
    expect(
      screen.queryByRole("textbox", { name: "Nom ou numéro de table" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sélectionner T02" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Sélectionner TR01" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Nom ou numéro de table" }),
    ).toHaveValue("TR01");
    expect(previewState.operations).toHaveLength(0);
  }, 15000);

  it("adds furniture from the full library and opens the real item settings", async () => {
    const navigation = await renderPage();
    fireEvent.click(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Ajouter du mobilier" }),
    );
    const library = await screen.findByRole("dialog", {
      name: "Bibliothèque de mobilier",
    });
    fireEvent.click(within(library).getByRole("button", { name: "Décor" }));
    fireEvent.change(
      within(library).getByRole("textbox", {
        name: "Rechercher un élément de mobilier",
      }),
      { target: { value: "Plante de table" } },
    );
    fireEvent.click(
      await within(library).findByRole("button", {
        name: "Afficher Plante de table",
      }),
    );
    fireEvent.click(
      within(library).getByRole("button", { name: "Ajouter au plan" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Bibliothèque de mobilier" }),
      ).not.toBeInTheDocument(),
    );
    const name = screen.getByRole("textbox", { name: "Nom de l’élément" });
    expect(name).toHaveValue("Plante 1");
    expect(
      screen.getByText("Modifications non enregistrées"),
    ).toBeInTheDocument();
    expect(previewState.rows.reservation_tables).toHaveLength(16);
  });

  it("locks a selected table, disables geometry controls and persists the lock", async () => {
    const navigation = await renderPage();
    fireEvent.click(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Sélectionner T02" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Verrouiller la position" }),
    );
    expect(screen.getByLabelText("Position X")).toBeDisabled();
    expect(screen.getByLabelText("Position Y")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Augmenter la capacité" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Finition : Noyer" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Tourner T02" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer", exact: true }),
    );
    await waitFor(() =>
      expect(
        (
          previewState.rows.reservation_tables.find((row) => row.id === "t02")
            ?.layout as { locked?: boolean }
        ).locked,
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByText("Plan enregistré")).toBeInTheDocument(),
    );
  });

  it("persists table shape, real seat capacity and finish through the actual inspector", async () => {
    const navigation = await renderPage();
    fireEvent.click(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    );
    const selectedCanvasTable = await screen.findByRole("button", {
      name: "Sélectionner T02",
    });
    const readTabletopStyle = () =>
      selectedCanvasTable
        .querySelector(
          '[data-floor-plan-asset="round-table-top"], [data-floor-plan-asset="square-table-top"], [data-floor-plan-asset="rect-table-top"]',
        )
        ?.getAttribute("style") || "";
    const oakStyle = readTabletopStyle();
    expect(oakStyle).not.toContain("filter:");
    fireEvent.click(selectedCanvasTable);
    fireEvent.click(
      screen.getByRole("button", { name: "Augmenter la capacité" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Forme carrée" }));
    expect(
      screen.getByRole("button", { name: "Forme carrée" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Finition : Noyer" }));
    expect(
      screen.getByRole("button", { name: "Finition : Noyer" }),
    ).toHaveAttribute("aria-pressed", "true");
    const walnutStyle = readTabletopStyle();
    expect(walnutStyle).toContain("filter:");
    expect(walnutStyle).not.toBe(oakStyle);
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer", exact: true }),
    );
    await waitFor(() =>
      expect(screen.getByText("Plan enregistré")).toBeInTheDocument(),
    );
    const saved = previewState.rows.reservation_tables.find(
      (row) => row.id === "t02",
    )!;
    expect(saved.capacity).toBe(5);
    const layout = saved.layout as {
      shape: string;
      finish: string;
      table_width: number;
      table_height: number;
      seat_placements: Array<{ count: number }>;
    };
    expect(layout.shape).toBe("rect");
    expect(layout.table_width).toBe(layout.table_height);
    expect(layout.finish).toBe("walnut");
    expect(
      layout.seat_placements.reduce(
        (total, placement) => total + placement.count,
        0,
      ),
    ).toBe(5);
  });

  it("retains the mode and edited draft when save is refused, then permits a successful retry", async () => {
    const navigation = await renderPage();
    fireEvent.click(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Sélectionner T02" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nom ou numéro de table" }),
      { target: { value: "Table Jardin" } },
    );
    previewState.rejectWrites = true;
    fireEvent.click(within(navigation).getByRole("tab", { name: "Service" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Erreur de sauvegarde",
          variant: "destructive",
        }),
      ),
    );
    expect(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("textbox", { name: "Nom ou numéro de table" }),
    ).toHaveValue("Table Jardin");
    expect(
      previewState.rows.reservation_tables.find((row) => row.id === "t02")
        ?.table_number,
    ).toBe("T02");
    expect(
      previewState.operations.some((operation) => operation.rejected),
    ).toBe(true);
    previewState.rejectWrites = false;
    fireEvent.click(within(navigation).getByRole("tab", { name: "Service" }));
    await waitFor(() =>
      expect(
        within(navigation).getByRole("tab", { name: "Service" }),
      ).toHaveAttribute("aria-selected", "true"),
    );
    expect(
      previewState.rows.reservation_tables.find((row) => row.id === "t02")
        ?.table_number,
    ).toBe("Table Jardin");
  });

  it("preserves the saving assignment when another placement or release is attempted, then unlocks after saving", async () => {
    await renderPage();
    let finishAssignmentWrite!: () => void;
    const assignmentWrite = new Promise<void>((resolve) => {
      finishAssignmentWrite = resolve;
    });
    const originalRpc = previewSupabase.rpc.bind(previewSupabase);
    const rpc = vi
      .spyOn(previewSupabase, "rpc")
      .mockImplementation((name, args) => {
        const request = originalRpc(name, args);
        return name === "restaurant_save_floor_plan_assignments"
          ? request.waitFor(assignmentWrite)
          : request;
      });

    try {
      fireEvent.click(screen.getByRole("button", { name: /^Léa Bernard,/ }));
      fireEvent.click(screen.getByRole("button", { name: /^T02, Compatible/ }));
      fireEvent.click(
        screen.getByRole("button", { name: "Enregistrer", exact: true }),
      );
      await waitFor(() => {
        expect(rpc).toHaveBeenCalledWith(
          "restaurant_save_floor_plan_assignments",
          expect.objectContaining({ p_assignments: { "r-lea": "t02" } }),
        );
        expect(
          screen.getByRole("button", { name: "Sauvegarde…", exact: true }),
        ).toBeDisabled();
      });
      expect(
        previewState.rows.reservation_slots.some(
          (slot) => slot.reservation_id === "r-lea",
        ),
      ).toBe(false);

      // Both actions reach the real page while its write is still in flight.
      fireEvent.click(screen.getByRole("button", { name: /^T06, Compatible/ }));
      expect(
        screen.getByRole("button", {
          name: "Léa Bernard, 20:00, 2 personnes, T02",
        }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", {
          name: "Libérer T02 pour Léa Bernard",
        }),
      );
      expect(
        screen.getByRole("button", {
          name: "Léa Bernard, 20:00, 2 personnes, T02",
        }),
      ).toBeInTheDocument();

      await act(async () => finishAssignmentWrite());
      await screen.findByText("Service synchronisé");
      expect(
        previewState.rows.reservation_slots.find(
          (slot) => slot.reservation_id === "r-lea",
        )?.table_id,
      ).toBe("t02");
      expect(
        rpc.mock.calls.filter(
          ([name]) => name === "restaurant_save_floor_plan_assignments",
        ),
      ).toHaveLength(1);

      // A successful save must restore the ability to change the assignment.
      fireEvent.click(
        screen.getByRole("button", {
          name: "Libérer T02 pour Léa Bernard",
        }),
      );
      expect(
        screen.getByRole("button", {
          name: "Léa Bernard, 20:00, 2 personnes, À placer",
        }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Enregistrer", exact: true }),
      );
      await waitFor(() =>
        expect(
          previewState.rows.reservation_slots.some(
            (slot) => slot.reservation_id === "r-lea",
          ),
        ).toBe(false),
      );
      await screen.findByText("Service synchronisé");
    } finally {
      finishAssignmentWrite();
      rpc.mockRestore();
    }
  });

  it("retains an unsaved service assignment when entering arrangement is refused", async () => {
    const navigation = await renderPage();
    previewState.rejectWrites = true;
    fireEvent.click(screen.getByRole("button", { name: /^Léa Bernard,/ }));
    fireEvent.click(screen.getByRole("button", { name: /^T02, Compatible/ }));
    await screen.findByRole("button", {
      name: "Léa Bernard, 20:00, 2 personnes, T02",
    });
    fireEvent.click(
      within(navigation).getByRole("tab", { name: "Aménagement" }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Erreur de sauvegarde",
          variant: "destructive",
        }),
      ),
    );
    expect(
      within(navigation).getByRole("tab", { name: "Service" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("button", {
        name: "Léa Bernard, 20:00, 2 personnes, T02",
      }),
    ).toBeInTheDocument();
    expect(
      previewState.rows.reservation_slots.some(
        (row) => row.reservation_id === "r-lea",
      ),
    ).toBe(false);
  });
});
