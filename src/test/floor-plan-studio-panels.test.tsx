import type { ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FloorPlanAIPanel, {
  type AIFloorPlanResult,
} from "@/components/floor-plan/FloorPlanAIPanel";
import StudioInspector from "@/components/floor-plan/StudioInspector";
import StudioPalette from "@/components/floor-plan/StudioPalette";
import type { StudioDraftTable } from "@/components/floor-plan/studioShared";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({ invokeSupabaseFunction: invoke }));
vi.mock("@/lib/optimizedImages", () => ({
  optimizeImageUpload: vi.fn(async (file: File) => file),
}));
vi.mock("@/components/floor-plan/FloorPlanItemIllustration", () => ({
  FloorPlanItemIllustration: () => <svg aria-hidden="true" />,
}));
vi.mock("@/components/floor-plan/FloorPlanMiniature", () => ({
  default: ({ label }: { label: string }) => (
    <div role="img" aria-label={label} />
  ),
}));
vi.mock("@/components/ui/ai-loading-state", () => ({
  AiLoadingState: ({ title }: { title: string }) => (
    <div role="status">{title}</div>
  ),
}));

const table: StudioDraftTable = {
  id: "persisted-t1",
  table_number: "T1",
  capacity: 4,
  is_active: true,
  sector: "Salle principale",
  layout: {
    x: 100,
    y: 120,
    w: 180,
    h: 180,
    shape: "rect",
    kind: "table",
    rotation: 0,
    seatLabels: [1, 2, 3, 4],
  },
};

function paletteProps(
  overrides: Partial<ComponentProps<typeof StudioPalette>> = {},
): ComponentProps<typeof StudioPalette> {
  return {
    selectedId: "restaurant-1",
    branchId: "22222222-2222-4222-8222-222222222222",
    selectedSector: "Salle principale",
    sectorOptions: ["Salle principale"],
    libraryTab: "tables",
    libraryQuery: "",
    canvasWidth: 1040,
    canvasHeight: 760,
    draftTables: [table],
    tablesLoading: false,
    newSectorName: "",
    onLibraryTabChange: vi.fn(),
    onLibraryQueryChange: vi.fn(),
    onPresetClick: vi.fn(),
    onSectorSelect: vi.fn(),
    onNewSectorNameChange: vi.fn(),
    onAddSector: vi.fn(),
    onApplyAILayout: vi.fn(),
    showInlineAssistant: false,
    presetsByTab: {
      tables: [
        {
          id: "round-2",
          label: "Table ronde",
          category: "table",
          kind: "table",
          capacity: 2,
          shape: "round",
          w: 140,
          h: 140,
        },
        {
          id: "square-4",
          label: "Table carrée",
          category: "table",
          kind: "table",
          capacity: 4,
          shape: "rect",
          w: 180,
          h: 180,
        },
      ],
      seating: [],
      structure: [],
      decor: [],
      event: [],
    },
    ...overrides,
  };
}

function inspectorProps(
  overrides: Partial<ComponentProps<typeof StudioInspector>> = {},
): ComponentProps<typeof StudioInspector> {
  return {
    selectedTable: {
      ...table,
      capacity: 0,
      layout: { ...table.layout, kind: "plant", shape: "round", w: 64, h: 64 },
    },
    selectedTableIsReservable: false,
    selectedTableDimensions: null,
    sectorOptions: ["Salle principale"],
    onRename: vi.fn(),
    onSectorChange: vi.fn(),
    onRotationChange: vi.fn(),
    onRotateIncrement: vi.fn(),
    onToggleActive: vi.fn(),
    onConfigureTable: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onUpdateFurnitureWidth: vi.fn(),
    onUpdateFurnitureHeight: vi.fn(),
    onUpdateFurnitureSize: vi.fn(),
    onPositionChange: vi.fn(),
    onLockedChange: vi.fn(),
    ...overrides,
  };
}

const aiResult: AIFloorPlanResult = {
  tables: [
    {
      table_number: "T1",
      capacity: 20,
      kind: "table",
      shape: "rect",
      x: 360,
      y: 200,
      w: 220,
      h: 220,
      rotation: 45,
      seatLabels: [],
    },
  ],
  explanation: "Une circulation plus dégagée autour des tables.",
};

beforeEach(() => {
  invoke.mockReset();
});
afterEach(cleanup);

describe("studio furniture library", () => {
  it("lets an expanded-library selection be inspected before adding it exactly once", () => {
    const props = paletteProps({ mode: "expanded" });
    render(<StudioPalette {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Afficher Table carrée, 4 places" }),
    );
    expect(
      screen.getByRole("heading", { name: "Table carrée" }),
    ).toBeInTheDocument();
    expect(props.onPresetClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au plan" }));
    expect(props.onPresetClick).toHaveBeenCalledExactlyOnceWith("square-4");
  });

  it("keeps compact-library quick addition connected to the real preset callback", () => {
    const props = paletteProps();
    render(<StudioPalette {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter Table ronde, 2 places" }),
    );
    expect(props.onPresetClick).toHaveBeenCalledExactlyOnceWith("round-2");
  });
});

describe("studio inspector", () => {
  it("blocks geometry and deletion for a locked item while allowing its lock to be removed", () => {
    const props = inspectorProps({
      selectedTable: { ...table, layout: { ...table.layout, locked: true } },
      selectedTableIsReservable: true,
    });
    render(<StudioInspector {...props} />);
    expect(screen.getByLabelText("Position X")).toBeDisabled();
    expect(screen.getByLabelText("Rotation")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Configurer la table et les assises",
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("switch", { name: "Verrouiller la position" }),
    );
    expect(props.onLockedChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("cancels a measurement with Escape and commits a valid furniture resize with its proportions", () => {
    const props = inspectorProps();
    render(<StudioInspector {...props} />);
    const width = screen.getByLabelText("Largeur");
    fireEvent.change(width, { target: { value: "240" } });
    fireEvent.keyDown(width, { key: "Escape" });
    fireEvent.blur(width);
    expect(props.onUpdateFurnitureSize).not.toHaveBeenCalled();
    fireEvent.change(width, { target: { value: "128" } });
    fireEvent.blur(width);
    expect(props.onUpdateFurnitureSize).toHaveBeenCalledExactlyOnceWith(
      128,
      128,
    );
    fireEvent.change(screen.getByLabelText("Position X"), {
      target: { value: "0" },
    });
    fireEvent.blur(screen.getByLabelText("Position X"));
    expect(props.onPositionChange).toHaveBeenCalledExactlyOnceWith(
      0,
      table.layout.y,
    );
  });

  it("connects shape, capacity and finish controls to persisted table configuration callbacks", () => {
    const props = inspectorProps({
      selectedTable: table,
      selectedTableIsReservable: true,
      onTableShapeChange: vi.fn(),
      onCapacityChange: vi.fn(),
      onFinishChange: vi.fn(),
    });
    render(<StudioInspector {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Forme ronde" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Augmenter la capacité" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finition : Noyer" }));
    expect(props.onTableShapeChange).toHaveBeenCalledExactlyOnceWith("round");
    expect(props.onCapacityChange).toHaveBeenCalledExactlyOnceWith(5);
    expect(props.onFinishChange).toHaveBeenCalledExactlyOnceWith("walnut");
  });
});

describe("studio AI assistant", () => {
  it("sends actual preferences, previews the application result and only applies on explicit request", async () => {
    invoke.mockResolvedValue({ data: aiResult, error: null });
    const onApply = vi.fn();
    const resolvePreview = vi.fn(() => [table]);
    render(
      <FloorPlanAIPanel
        restaurantId="restaurant-1"
        branchId="22222222-2222-4222-8222-222222222222"
        mode="workspace"
        sectorLabel="Salle principale"
        currentLayout={[table]}
        canvasWidth={1040}
        canvasHeight={760}
        onApply={onApply}
        resolvePreview={resolvePreview}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Appliquer au plan" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Plus de couverts" }));
    fireEvent.change(screen.getByLabelText("Places souhaitées"), {
      target: { value: "24" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Générer une proposition" }),
    );
    await screen.findByRole("heading", { name: "Proposition 1" });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [endpoint, request] = invoke.mock.calls[0];
    expect(endpoint).toBe("floorplan-ai");
    expect(request.body.restaurantId).toBe("restaurant-1");
    expect(request.body.branchId).toBe("22222222-2222-4222-8222-222222222222");
    expect(request.body.prompt).toContain("24 places au total");
    expect(request.body.prompt).toContain("davantage de places");
    expect(request.body.prompt).toContain("120 unités du canevas");
    expect(resolvePreview).toHaveBeenCalled();
    expect(screen.queryByText("20 places")).not.toBeInTheDocument();
    expect(screen.getAllByText("4 places").length).toBeGreaterThan(0);
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Appliquer au plan" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].tables).toEqual(aiResult.tables);
  });

  it("preserves the exact protected layout and keeps a usable proposal after a later generation fails", async () => {
    const bench: StudioDraftTable = {
      ...table,
      id: "bench-1",
      table_number: "Banquette 1",
      capacity: 0,
      layout: {
        ...table.layout,
        kind: "banquette",
        x: 75,
        y: 90,
        w: 300,
        h: 65,
      },
    };
    invoke.mockResolvedValueOnce({
      data: {
        ...aiResult,
        tables: [
          ...aiResult.tables,
          {
            ...bench.layout,
            table_number: bench.table_number,
            capacity: 0,
            x: 800,
            y: 600,
          },
        ],
      },
      error: null,
    });
    const onApply = vi.fn();
    render(
      <FloorPlanAIPanel
        restaurantId="restaurant-1"
        branchId="22222222-2222-4222-8222-222222222222"
        currentLayout={[table, bench]}
        canvasWidth={1040}
        canvasHeight={760}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Générer une proposition" }),
    );
    await screen.findByRole("heading", { name: "Proposition 1" });
    invoke.mockRejectedValueOnce(new Error("Unavailable"));
    fireEvent.click(
      screen.getByRole("button", { name: "Créer une autre proposition" }),
    );
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Appliquer au plan" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(
      onApply.mock.calls[0][0].tables.find(
        (item: { table_number: string }) =>
          item.table_number === bench.table_number,
      ),
    ).toMatchObject({
      ...bench.layout,
      table_number: bench.table_number,
      capacity: 0,
    });
  });

  it("ignores a proposal returned for a different restaurant or space", async () => {
    let finish: (value: {
      data: AIFloorPlanResult;
      error: null;
    }) => void = () => undefined;
    invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const props = {
      restaurantId: "restaurant-1",
      branchId: "22222222-2222-4222-8222-222222222222",
      currentLayout: [table],
      canvasWidth: 1040,
      canvasHeight: 760,
      onApply: vi.fn(),
    };
    const view = render(
      <FloorPlanAIPanel {...props} sectorLabel="Salle principale" />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Générer une proposition" }),
    );
    view.rerender(<FloorPlanAIPanel {...props} sectorLabel="Terrasse" />);
    await act(async () => finish({ data: aiResult, error: null }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Appliquer au plan" }),
      ).toBeDisabled(),
    );
    expect(
      screen.queryByRole("heading", { name: "Proposition 1" }),
    ).not.toBeInTheDocument();
    expect(props.onApply).not.toHaveBeenCalled();
  });
});


describe("studio AI assistant branch isolation", () => {
  const first = "22222222-2222-4222-8222-222222222222";
  const second = "33333333-3333-4333-8333-333333333333";
  function props(branchId: string | null = first) {
    return { restaurantId: "restaurant-1", branchId, currentLayout: [],
      canvasWidth: 1040, canvasHeight: 760, onApply: vi.fn() };
  }
  it("passes the selected branch even when the plan has no tables", async () => {
    invoke.mockResolvedValue({ data: aiResult, error: null });
    render(<FloorPlanAIPanel {...props(second)} />);
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }));
    await screen.findByRole("heading", { name: "Proposition 1" });
    expect(invoke.mock.calls[0][1].body).toMatchObject({ branchId: second, currentLayout: [] });
  });
  it("disables generation while no branch is selected", () => {
    render(<FloorPlanAIPanel {...props(null)} />);
    const button = screen.getByRole("button", { name: "Générer une proposition" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("ignores a late result after switching branches with the same restaurant and sector", async () => {
    let finish!: (value: { data: AIFloorPlanResult; error: null }) => void;
    invoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const initial = props();
    const view = render(<FloorPlanAIPanel {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }));
    view.rerender(<FloorPlanAIPanel {...initial} branchId={second} />);
    await act(async () => finish({ data: aiResult, error: null }));
    expect(screen.queryByRole("heading", { name: "Proposition 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appliquer au plan" })).toBeDisabled();
    expect(initial.onApply).not.toHaveBeenCalled();
  });
  it("hides existing proposals when another branch is selected", async () => {
    invoke.mockResolvedValue({ data: aiResult, error: null });
    const initial = props();
    const view = render(<FloorPlanAIPanel {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }));
    await screen.findByRole("heading", { name: "Proposition 1" });
    view.rerender(<FloorPlanAIPanel {...initial} branchId={second} />);
    expect(screen.queryByRole("heading", { name: "Proposition 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appliquer au plan" })).toBeDisabled();
    expect(initial.onApply).not.toHaveBeenCalled();
  });
  it("passes branch selection from the inline furniture-library assistant", async () => {
    invoke.mockResolvedValue({ data: aiResult, error: null });
    render(<StudioPalette {...paletteProps({ showInlineAssistant: true, branchId: second })} />);
    fireEvent.click(screen.getByRole("button", { name: "Assistant IA" }));
    fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }));
    await screen.findByRole("heading", { name: "Proposition 1" });
    expect(invoke.mock.calls[0][1].body.branchId).toBe(second);
  });
  it.each(["branch_id_missing", "invalid_branch_id", "branch_not_found", "branch_lookup_failed"])(
    "shows a useful French message instead of raw %s", async (code) => {
      invoke.mockRejectedValue(new Error(code));
      render(<FloorPlanAIPanel {...props()} />);
      fireEvent.click(screen.getByRole("button", { name: "Générer une proposition" }));
      const alert = await screen.findByRole("alert");
      expect(alert).not.toHaveTextContent(code);
      expect(alert).toHaveTextContent(/établissement/);
    },
  );
});
