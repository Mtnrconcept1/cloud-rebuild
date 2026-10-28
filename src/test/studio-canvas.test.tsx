import { createRef, type ComponentProps } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StudioCanvas from "@/components/floor-plan/StudioCanvas";

function canvasProps(
  overrides: Partial<ComponentProps<typeof StudioCanvas>> = {},
): ComponentProps<typeof StudioCanvas> {
  return {
    selectedSector: "Salle",
    canvasWidth: 1040,
    canvasHeight: 760,
    canvasZoom: 1,
    canvasZoomLabel: "100%",
    canvasRef: createRef<HTMLDivElement>(),
    canvasViewportRef: createRef<HTMLDivElement>(),
    visibleTables: [],
    selectedTableId: null,
    draggingTableId: null,
    onTablePress: vi.fn(),
    onCanvasBackgroundPress: vi.fn(),
    onStartDraggingTable: vi.fn(),
    onStartResizingTable: vi.fn(),
    onStartRotatingTable: vi.fn(),
    onUpdateCanvasZoom: vi.fn(),
    onCanvasViewportResize: vi.fn(),
    onNudgeTable: vi.fn(),
    onDeleteTable: vi.fn(),
    getRenderedFrame: () => ({ x: 80, y: 90, w: 84, h: 84 }),
    ...overrides,
  };
}

describe("StudioCanvas", () => {
  it("renders a full-size responsive work canvas for the floor plan editor", () => {
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
        canvasHeight={760}
        canvasZoom={1}
        canvasZoomLabel="100%"
        canvasRef={canvasRef}
        canvasViewportRef={canvasViewportRef}
        visibleTables={[]}
        selectedTableId={null}
        draggingTableId={null}
        onTablePress={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={vi.fn()}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={vi.fn()}
        onCanvasViewportResize={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 84, h: 84 })}
      />,
    );

    const canvas = container.querySelector('[data-floor-plan-canvas="stage"]');

    expect(canvas).not.toBeNull();
    expect(canvas).toHaveStyle({
      width: "1040px",
      height: "760px",
      aspectRatio: "1040 / 760",
    });
  });

  it("reduces zoom with its named control and fits the room again when recentering", () => {
    const onUpdateCanvasZoom = vi.fn();
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { getByRole } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
        canvasHeight={760}
        canvasZoom={0.73}
        canvasZoomLabel="73%"
        canvasRef={canvasRef}
        canvasViewportRef={canvasViewportRef}
        visibleTables={[]}
        selectedTableId={null}
        draggingTableId={null}
        onTablePress={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={vi.fn()}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={onUpdateCanvasZoom}
        onCanvasViewportResize={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 84, h: 84 })}
      />,
    );

    const zoomOutButton = getByRole("button", { name: "Réduire le zoom" });
    expect(zoomOutButton).not.toBeNull();

    fireEvent.click(zoomOutButton as Element);
    expect(onUpdateCanvasZoom).toHaveBeenCalledWith(0.58);

    onUpdateCanvasZoom.mockClear();
    fireEvent.click(
      getByRole("button", { name: "Recentrer et ajuster le plan" }),
    );
    expect(onUpdateCanvasZoom).toHaveBeenCalledWith(1);
  });

  it("starts dragging furniture from the whole object surface", () => {
    const onStartDraggingTable = vi.fn();
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
        canvasHeight={760}
        canvasZoom={1}
        canvasZoomLabel="100%"
        canvasRef={canvasRef}
        canvasViewportRef={canvasViewportRef}
        visibleTables={[
          {
            id: "plant",
            table_number: "Plante",
            capacity: 0,
            is_active: true,
            sector: "Salle",
            layout: {
              x: 80,
              y: 90,
              w: 84,
              h: 84,
              rotation: 0,
              shape: "round",
              kind: "plant",
              seatLabels: [],
            },
          },
        ]}
        selectedTableId={null}
        draggingTableId={null}
        onTablePress={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={onStartDraggingTable}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={vi.fn()}
        onCanvasViewportResize={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 84, h: 84 })}
      />,
    );
    const furnitureSurface = container.querySelector('[style*="cursor: grab"]');

    expect(furnitureSurface).not.toBeNull();
    fireEvent.pointerDown(furnitureSurface as Element, {
      clientX: 90,
      clientY: 100,
    });

    expect(onStartDraggingTable).toHaveBeenCalledWith(
      expect.anything(),
      "plant",
    );
  });

  it("starts dragging reservable tables from the whole object surface", () => {
    const onStartDraggingTable = vi.fn();
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
        canvasHeight={760}
        canvasZoom={1}
        canvasZoomLabel="100%"
        canvasRef={canvasRef}
        canvasViewportRef={canvasViewportRef}
        visibleTables={[
          {
            id: "t1",
            table_number: "T1",
            capacity: 4,
            is_active: true,
            sector: "Salle",
            layout: {
              x: 80,
              y: 90,
              w: 176,
              h: 112,
              rotation: 0,
              shape: "rect",
              kind: "table",
              seatLabels: [1, 1, 1, 1],
            },
          },
        ]}
        selectedTableId={null}
        draggingTableId={null}
        onTablePress={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={onStartDraggingTable}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={vi.fn()}
        onCanvasViewportResize={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 176, h: 112 })}
      />,
    );
    const tableSurface = container.querySelector('[style*="cursor: grab"]');

    expect(tableSurface).not.toBeNull();
    fireEvent.pointerDown(tableSurface as Element, {
      clientX: 96,
      clientY: 104,
    });

    expect(onStartDraggingTable).toHaveBeenCalledWith(expect.anything(), "t1");
  });

  it("keeps tiny selected furniture easy to target without enlarging its visual", () => {
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
        canvasHeight={760}
        canvasZoom={1}
        canvasZoomLabel="100%"
        canvasRef={canvasRef}
        canvasViewportRef={canvasViewportRef}
        visibleTables={[
          {
            id: "plant",
            table_number: "Plante",
            capacity: 0,
            is_active: true,
            sector: "Salle",
            layout: {
              x: 80,
              y: 90,
              w: 8,
              h: 6,
              rotation: 0,
              shape: "round",
              kind: "plant",
              seatLabels: [],
            },
          },
        ]}
        selectedTableId="plant"
        draggingTableId={null}
        onTablePress={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={vi.fn()}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={vi.fn()}
        onCanvasViewportResize={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 8, h: 6 })}
      />,
    );

    expect(
      container.querySelector(
        '[style*="left: 66px"][style*="width: 36px"][style*="height: 36px"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[style*="left: 14px"][style*="width: 8px"][style*="height: 6px"]',
      ),
    ).not.toBeNull();
  });

  it("nudges and deletes the selected object from the keyboard", () => {
    const onNudgeTable = vi.fn();
    const onDeleteTable = vi.fn();
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { getByLabelText } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
        canvasHeight={760}
        canvasZoom={1}
        canvasZoomLabel="100%"
        canvasRef={canvasRef}
        canvasViewportRef={canvasViewportRef}
        visibleTables={[
          {
            id: "plant",
            table_number: "Plante",
            capacity: 0,
            is_active: true,
            sector: "Salle",
            layout: {
              x: 80,
              y: 90,
              w: 8,
              h: 6,
              rotation: 0,
              shape: "round",
              kind: "plant",
              seatLabels: [],
            },
          },
        ]}
        selectedTableId="plant"
        draggingTableId={null}
        onTablePress={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={vi.fn()}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={vi.fn()}
        onNudgeTable={onNudgeTable}
        onDeleteTable={onDeleteTable}
        onCanvasViewportResize={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 8, h: 6 })}
      />,
    );
    const selectedObject = getByLabelText("Sélectionner Plante");

    fireEvent.keyDown(selectedObject, { key: "ArrowRight" });
    fireEvent.keyDown(selectedObject, { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(selectedObject, { key: "Delete" });

    expect(onNudgeTable).toHaveBeenNthCalledWith(1, "plant", 1, 0);
    expect(onNudgeTable).toHaveBeenNthCalledWith(2, "plant", 0, -10);
    expect(onDeleteTable).toHaveBeenCalledWith("plant");
  });

  it("keeps a locked object selectable while suppressing dragging, resizing, rotation and keyboard edits", () => {
    const props = canvasProps({
      selectedTableId: "plant",
      visibleTables: [
        {
          id: "plant",
          table_number: "Plante",
          capacity: 0,
          is_active: true,
          sector: "Salle",
          layout: {
            x: 80,
            y: 90,
            w: 84,
            h: 84,
            rotation: 0,
            shape: "round",
            kind: "plant",
            seatLabels: [],
            locked: true,
          },
        },
      ],
    });
    const { getByRole, queryByRole } = render(<StudioCanvas {...props} />);
    const object = getByRole("button", {
      name: "Sélectionner Plante, verrouillé",
    });

    fireEvent.click(object);
    fireEvent.keyDown(object, { key: "Enter" });
    fireEvent.pointerDown(object, { clientX: 90, clientY: 100 });
    fireEvent.keyDown(object, { key: "ArrowRight" });
    fireEvent.keyDown(object, { key: "Delete" });

    expect(props.onTablePress).toHaveBeenCalledTimes(2);
    expect(props.onTablePress).toHaveBeenLastCalledWith("plant");
    expect(props.onStartDraggingTable).not.toHaveBeenCalled();
    expect(props.onStartResizingTable).not.toHaveBeenCalled();
    expect(props.onStartRotatingTable).not.toHaveBeenCalled();
    expect(props.onNudgeTable).not.toHaveBeenCalled();
    expect(props.onDeleteTable).not.toHaveBeenCalled();
    expect(queryByRole("button", { name: /Redimensionner Plante/ })).toBeNull();
    expect(queryByRole("button", { name: "Tourner Plante" })).toBeNull();
  });

  it("applies the grid display and magnetism settings independently", () => {
    const props = canvasProps({
      showGrid: false,
      snapToGrid: false,
      onShowGridChange: vi.fn(),
      onSnapToGridChange: vi.fn(),
    });
    const { container, getByRole, rerender } = render(
      <StudioCanvas {...props} />,
    );
    const stage = container.querySelector('[data-floor-plan-canvas="stage"]');
    expect(stage?.querySelector('[style*="background-image"]')).toBeNull();
    expect(getByRole("button", { name: "Grille" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(getByRole("button", { name: "Magnétisme" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(getByRole("button", { name: "Grille" }));
    expect(props.onShowGridChange).toHaveBeenCalledWith(true);
    expect(props.onSnapToGridChange).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: "Magnétisme" }));
    expect(props.onSnapToGridChange).toHaveBeenCalledWith(true);

    rerender(<StudioCanvas {...props} showGrid snapToGrid />);
    expect(stage?.querySelector('[style*="background-image"]')).not.toBeNull();
    expect(getByRole("button", { name: "Grille" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(getByRole("button", { name: "Magnétisme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(getByRole("button", { name: "Grille" }));
    fireEvent.click(getByRole("button", { name: "Magnétisme" }));
    expect(props.onShowGridChange).toHaveBeenLastCalledWith(false);
    expect(props.onSnapToGridChange).toHaveBeenLastCalledWith(false);
  });
});
