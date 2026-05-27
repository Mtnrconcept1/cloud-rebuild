import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StudioCanvas from "@/components/floor-plan/StudioCanvas";

describe("StudioCanvas", () => {
  it("starts dragging furniture from the whole object surface", () => {
    const onStartDraggingTable = vi.fn();
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
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
        onCanvasWheel={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={onStartDraggingTable}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 84, h: 84 })}
      />,
    );
    const furnitureSurface = container.querySelector('[style*="cursor: grab"]');

    expect(furnitureSurface).not.toBeNull();
    fireEvent.pointerDown(furnitureSurface as Element, { clientX: 90, clientY: 100 });

    expect(onStartDraggingTable).toHaveBeenCalledWith(expect.anything(), "plant");
  });

  it("starts dragging reservable tables from the whole object surface", () => {
    const onStartDraggingTable = vi.fn();
    const canvasRef = createRef<HTMLDivElement>();
    const canvasViewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <StudioCanvas
        selectedSector="Salle"
        canvasWidth={1040}
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
        onCanvasWheel={vi.fn()}
        onCanvasBackgroundPress={vi.fn()}
        onStartDraggingTable={onStartDraggingTable}
        onStartResizingTable={vi.fn()}
        onStartRotatingTable={vi.fn()}
        onUpdateCanvasZoom={vi.fn()}
        getRenderedFrame={() => ({ x: 80, y: 90, w: 176, h: 112 })}
      />,
    );
    const tableSurface = container.querySelector('[style*="cursor: grab"]');

    expect(tableSurface).not.toBeNull();
    fireEvent.pointerDown(tableSurface as Element, { clientX: 96, clientY: 104 });

    expect(onStartDraggingTable).toHaveBeenCalledWith(expect.anything(), "t1");
  });
});
