import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ServiceBoard from "@/components/floor-plan/ServiceBoard";

function renderServiceBoard(overrides: Partial<Parameters<typeof ServiceBoard>[0]> = {}) {
  const canvasRef = createRef<HTMLDivElement>();
  const canvasViewportRef = createRef<HTMLDivElement>();

  return render(
    <ServiceBoard
      selectedSector="Salle"
      subtitle="Aujourd'hui"
      activeReservationLabel={null}
      canvasWidth={1040}
      canvasHeight={760}
      canvasZoom={1}
      canvasZoomLabel="100%"
      canvasRef={canvasRef}
      canvasViewportRef={canvasViewportRef}
      visibleTables={[]}
      visibleAssignmentsByTable={new Map()}
      selectedTableId={null}
      selectedReservationId={null}
      draggedReservationId={null}
      dragOverTableId={null}
      visibleTablesCount={0}
      availableTablesCount={0}
      unassignedReservationsCount={0}
      onTablePress={vi.fn()}
      onPrimaryReservationPress={vi.fn()}
      onCanvasWheel={vi.fn()}
      onCanvasDragOver={vi.fn()}
      onCanvasDrop={vi.fn()}
      onCanvasDragLeave={vi.fn()}
      onCanvasBackgroundPress={vi.fn()}
      onStartDraggingTable={vi.fn()}
      onStartResizingTable={vi.fn()}
      onStartRotatingTable={vi.fn()}
      onUpdateCanvasZoom={vi.fn()}
      onReservationStatusChange={vi.fn()}
      onReleaseReservation={vi.fn()}
      getReservationDropState={() => ({ ok: false, reason: null })}
      getRenderedFrame={() => ({ x: 80, y: 90, w: 180, h: 150 })}
      getTableContentPadding={() => ({ top: 0, right: 0, bottom: 0, left: 0 })}
      {...overrides}
    />,
  );
}

describe("ServiceBoard", () => {
  it("renders a full-size responsive work canvas for service mode", () => {
    const { container } = renderServiceBoard();

    const canvas = container.querySelector('[data-floor-plan-canvas="stage"]');

    expect(canvas).not.toBeNull();
    expect(canvas).toHaveStyle({
      width: "1040px",
      height: "760px",
      aspectRatio: "1040 / 760",
    });
  });

  it("keeps the service zoom-out button as a decrement instead of a reset", () => {
    const onUpdateCanvasZoom = vi.fn();
    const { container } = renderServiceBoard({
      canvasZoom: 0.73,
      canvasZoomLabel: "73%",
      onUpdateCanvasZoom,
    });

    const zoomOutButton = container.querySelector(".rounded-2xl button");
    expect(zoomOutButton).not.toBeNull();

    fireEvent.click(zoomOutButton as Element);
    expect(onUpdateCanvasZoom).toHaveBeenCalledWith(0.63);
  });

  it("starts dragging furniture from the whole object surface", () => {
    const onStartDraggingTable = vi.fn();
    const { container } = renderServiceBoard({
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
          },
        },
      ],
      visibleTablesCount: 1,
      onStartDraggingTable,
      getRenderedFrame: () => ({ x: 80, y: 90, w: 84, h: 84 }),
    });
    const furnitureSurface = container.querySelector(".absolute.select-none");

    expect(furnitureSurface).not.toBeNull();
    fireEvent.pointerDown(furnitureSurface as Element, { clientX: 90, clientY: 100 });

    expect(onStartDraggingTable).toHaveBeenCalledWith(expect.anything(), "plant");
  });

  it("keeps tiny service furniture easy to target without enlarging its visual", () => {
    const { container } = renderServiceBoard({
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
            w: 8,
            h: 6,
            rotation: 0,
            shape: "round",
            kind: "plant",
            seatLabels: [],
          },
        },
      ],
      visibleTablesCount: 1,
      getRenderedFrame: () => ({ x: 80, y: 90, w: 8, h: 6 }),
    });

    expect(container.querySelector('[style*="left: 66px"][style*="width: 36px"][style*="height: 36px"]')).not.toBeNull();
    expect(container.querySelector('[style*="left: 14px"][style*="width: 8px"][style*="height: 6px"]')).not.toBeNull();
  });

  it("renders late reservation state directly on the table", () => {
    const now = new Date("2026-05-27T19:47:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const { getByText } = renderServiceBoard({
      visibleTables: [
        {
          id: "t1",
          table_number: "T1",
          capacity: 4,
          is_active: true,
          sector: "Salle",
          layout: {
            x: 80,
            y: 90,
            w: 180,
            h: 150,
            rotation: 0,
            shape: "rect",
            kind: "table",
            seatLabels: [1, 1, 1, 1],
          },
        },
      ],
      visibleAssignmentsByTable: new Map([[
        "t1",
        [{
          id: "r1",
          user_id: "u1",
          restaurant_id: "restaurant",
          table_id: "t1",
          date: "2026-05-27",
          time: "19:30",
          party_size: 4,
          status: "confirmed",
          notes: null,
          special_requests: null,
          feature: null,
          metadata: {},
          created_at: "2026-05-27T10:00:00Z",
          updated_at: "2026-05-27T10:00:00Z",
          confirmed_at: null,
          customer: { full_name: "Martin", phone: null },
        } as never],
      ]]),
      visibleTablesCount: 1,
      availableTablesCount: 0,
      getRenderedFrame: () => ({ x: 80, y: 90, w: 190, h: 170 }),
    });

    expect(getByText("Retard")).toBeInTheDocument();
    expect(getByText("17 min")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("renders overlapping reservations as an urgent table conflict", () => {
    const { getByText } = renderServiceBoard({
      visibleTables: [
        {
          id: "t1",
          table_number: "T1",
          capacity: 4,
          is_active: true,
          sector: "Salle",
          layout: {
            x: 80,
            y: 90,
            w: 190,
            h: 170,
            rotation: 0,
            shape: "rect",
            kind: "table",
            seatLabels: [1, 1, 1, 1],
          },
        },
      ],
      visibleAssignmentsByTable: new Map([[
        "t1",
        [
          {
            id: "r1",
            user_id: "u1",
            restaurant_id: "restaurant",
            table_id: "t1",
            date: "2026-05-27",
            time: "19:00",
            party_size: 2,
            status: "confirmed",
            notes: null,
            special_requests: null,
            feature: null,
            metadata: {},
            created_at: "2026-05-27T10:00:00Z",
            updated_at: "2026-05-27T10:00:00Z",
            confirmed_at: null,
            customer: { full_name: "Martin", phone: null },
          } as never,
          {
            id: "r2",
            user_id: "u2",
            restaurant_id: "restaurant",
            table_id: "t1",
            date: "2026-05-27",
            time: "20:00",
            party_size: 2,
            status: "confirmed",
            notes: null,
            special_requests: null,
            feature: null,
            metadata: {},
            created_at: "2026-05-27T10:00:00Z",
            updated_at: "2026-05-27T10:00:00Z",
            confirmed_at: null,
            customer: { full_name: "Durand", phone: null },
          } as never,
        ],
      ]]),
      visibleTablesCount: 1,
      availableTablesCount: 0,
      getRenderedFrame: () => ({ x: 80, y: 90, w: 190, h: 170 }),
    });

    expect(getByText("Conflit horaire")).toBeInTheDocument();
    expect(getByText("2 réservations")).toBeInTheDocument();
  });

  it("shows quick service actions on the selected assigned table", () => {
    const onReservationStatusChange = vi.fn();
    const onReleaseReservation = vi.fn();
    const { getByRole } = renderServiceBoard({
      selectedTableId: "t1",
      visibleTables: [
        {
          id: "t1",
          table_number: "T1",
          capacity: 4,
          is_active: true,
          sector: "Salle",
          layout: {
            x: 80,
            y: 90,
            w: 220,
            h: 180,
            rotation: 0,
            shape: "rect",
            kind: "table",
            seatLabels: [1, 1, 1, 1],
          },
        },
      ],
      visibleAssignmentsByTable: new Map([[
        "t1",
        [{
          id: "r1",
          user_id: "u1",
          restaurant_id: "restaurant",
          table_id: "t1",
          date: "2026-05-27",
          time: "19:30",
          party_size: 4,
          status: "confirmed",
          notes: null,
          special_requests: null,
          feature: null,
          metadata: {},
          created_at: "2026-05-27T10:00:00Z",
          updated_at: "2026-05-27T10:00:00Z",
          confirmed_at: null,
          customer: { full_name: "Martin", phone: null },
        } as never],
      ]]),
      visibleTablesCount: 1,
      availableTablesCount: 0,
      getRenderedFrame: () => ({ x: 80, y: 90, w: 220, h: 180 }),
      onReservationStatusChange,
      onReleaseReservation,
    });

    fireEvent.click(getByRole("button", { name: "Marquer Martin arrive" }));
    fireEvent.click(getByRole("button", { name: "Installer Martin" }));
    fireEvent.click(getByRole("button", { name: "Marquer Martin no-show" }));
    fireEvent.click(getByRole("button", { name: "Liberer T1" }));

    expect(onReservationStatusChange).toHaveBeenNthCalledWith(1, "r1", "arrived");
    expect(onReservationStatusChange).toHaveBeenNthCalledWith(2, "r1", "seated");
    expect(onReservationStatusChange).toHaveBeenNthCalledWith(3, "r1", "no_show");
    expect(onReleaseReservation).toHaveBeenCalledWith("r1");
  });
});
