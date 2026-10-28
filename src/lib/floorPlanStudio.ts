import {
  clampFloorPlanLayout,
  ensureFloorPlanLayoutFitsCapacity,
  getResolvedFloorPlanDimensions,
  isReservableFloorPlanItem,
  type FloorPlanRenderedFrame,
  type FloorPlanResizeHandle,
  type FloorPlanTableLayout,
} from "./floorPlan";

export type FloorPlanStudioItem = {
  id: string;
  table_number: string;
  capacity: number;
  is_active: boolean;
  sector: string;
  layout: FloorPlanTableLayout;
};

export function getFloorPlanSpaceStats(items: readonly FloorPlanStudioItem[]) {
  const tables = items.filter((item) =>
    isReservableFloorPlanItem(item.layout.kind),
  );
  const active = tables.filter((item) => item.is_active);
  return {
    tables: tables.length,
    activeTables: active.length,
    covers: active.reduce((sum, table) => sum + table.capacity, 0),
    furniture: items.length - tables.length,
    hidden: items.filter((item) => !item.is_active).length,
  };
}

/** Snap in the stored coordinate system, independently of viewport and zoom. */
export function snapFloorPlanPosition(
  layout: FloorPlanTableLayout,
  enabled: boolean,
  step = 10,
) {
  if (!enabled || layout.locked) return layout;
  return clampFloorPlanLayout({
    ...layout,
    x: Math.round(layout.x / step) * step,
    y: Math.round(layout.y / step) * step,
  });
}

/**
 * Pointer deltas and frame dimensions are in the unzoomed canvas coordinates.
 * Resize along the item's own axes, then move its centre so the opposite handle
 * stays at the same canvas point even when the item is rotated.
 */
export function resizeRotatedFloorPlanFrame(
  frame: FloorPlanRenderedFrame,
  handle: FloorPlanResizeHandle,
  deltaX: number,
  deltaY: number,
  minimumWidth: number,
  minimumHeight: number,
  rotation: number,
  ratioLocked = false,
): FloorPlanRenderedFrame {
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = deltaX * cos + deltaY * sin;
  const localY = -deltaX * sin + deltaY * cos;
  const horizontal = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const vertical = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  let width = horizontal
    ? Math.max(minimumWidth, frame.w + horizontal * localX)
    : frame.w;
  let height = vertical
    ? Math.max(minimumHeight, frame.h + vertical * localY)
    : frame.h;

  if (ratioLocked) {
    // Project a corner's movement onto its fixed-ratio diagonal. Unlike taking
    // the larger axis, this stays continuous when the pointer crosses that line.
    const axisWidth = horizontal * frame.w;
    const axisHeight = vertical * frame.h;
    const scale = Math.max(
      minimumWidth / frame.w,
      minimumHeight / frame.h,
      1 +
        (axisWidth * localX + axisHeight * localY) /
          (axisWidth ** 2 + axisHeight ** 2),
    );
    width = frame.w * scale;
    height = frame.h * scale;
  }

  const centreShiftX = (horizontal * (width - frame.w)) / 2;
  const centreShiftY = (vertical * (height - frame.h)) / 2;
  const centreX =
    frame.x + frame.w / 2 + centreShiftX * cos - centreShiftY * sin;
  const centreY =
    frame.y + frame.h / 2 + centreShiftX * sin + centreShiftY * cos;
  return {
    x: centreX - width / 2,
    y: centreY - height / 2,
    w: width,
    h: height,
  };
}

/** Rebuild seating through the same model as the detailed table configurator. */
export function configureFloorPlanTable(
  layout: FloorPlanTableLayout,
  capacity: number,
  requestedShape?: "round" | "square" | "rect",
) {
  if (layout.locked || !isReservableFloorPlanItem(layout.kind))
    return { layout, capacity };
  const nextCapacity = Math.min(32, Math.max(1, Math.round(capacity)));
  const shape =
    requestedShape === "square" ? "rect" : requestedShape || layout.shape;
  const base = layout.tableWidth || 100;
  const tableWidth = requestedShape === "rect" ? Math.max(140, base) : base;
  const tableHeight =
    requestedShape === "round" || requestedShape === "square"
      ? tableWidth
      : requestedShape === "rect"
        ? Math.min(90, tableWidth * 0.6)
        : layout.tableHeight;
  const resolved = getResolvedFloorPlanDimensions({
    capacity: nextCapacity,
    shape,
    seatType: layout.seatType === "corner-bench" ? "chair" : layout.seatType,
    tableWidth,
    tableHeight,
  });
  const nextLayout = ensureFloorPlanLayoutFitsCapacity(
    {
      ...layout,
      shape,
      seatPlacements: resolved.seatPlacements,
      cornerBenchCorners: resolved.cornerBenchCorners,
      cornerBenchConfigs: resolved.cornerBenchConfigs,
      seatType: resolved.seatType,
      tableWidth: resolved.tableWidth,
      tableHeight: resolved.tableHeight,
      w: resolved.footprintWidth,
      h: resolved.footprintHeight,
    },
    nextCapacity,
    shape,
    "table",
  );
  return {
    layout: clampFloorPlanLayout(nextLayout),
    capacity: resolved.capacity,
  };
}

/** Keep identities and service links. AI edits are scoped to one space and undoable. */
export function reconcileFloorPlanProposal<T extends FloorPlanStudioItem>(
  current: readonly T[],
  proposed: readonly T[],
  sector: string,
) {
  const matching = new Map<string, T[]>();
  const key = (item: T) =>
    `${item.layout.kind}:${item.table_number.trim().toLocaleLowerCase("fr")}`;
  current
    .filter((item) => item.sector === sector)
    .forEach((item) =>
      matching.set(key(item), [...(matching.get(key(item)) || []), item]),
    );
  const used = new Set<string>();
  const replacements: T[] = [];
  for (const proposal of proposed) {
    const original = matching
      .get(key(proposal))
      ?.find((item) => !used.has(item.id));
    if (original) {
      used.add(original.id);
      // Identity, activity and capacity are operational data, not AI styling.
      replacements.push(
        original.layout.locked
          ? original
          : {
              ...original,
              layout: clampFloorPlanLayout({
                ...original.layout,
                x: proposal.layout.x,
                y: proposal.layout.y,
                rotation: proposal.layout.rotation,
              }),
            },
      );
    } else {
      replacements.push({ ...proposal, sector });
    }
  }
  // Omitted tables, structure, locks and all other rooms remain available.
  return [...current.filter((item) => !used.has(item.id)), ...replacements];
}

/** Restore presentation settings without replacing table identities or removing absent rooms. */
export function restoreFloorPlanConfiguration<T extends FloorPlanStudioItem>(
  current: readonly T[],
  saved: readonly T[],
) {
  const used = new Set<string>();
  const restored = saved.map((savedItem) => {
    const original =
      current.find((item) => !used.has(item.id) && item.id === savedItem.id) ||
      current.find(
        (item) =>
          !used.has(item.id) &&
          item.sector === savedItem.sector &&
          item.layout.kind === savedItem.layout.kind &&
          item.table_number.trim().toLocaleLowerCase("fr") ===
            savedItem.table_number.trim().toLocaleLowerCase("fr"),
      );
    if (!original) return savedItem;
    used.add(original.id);
    if (original.layout.locked) return original;
    return {
      ...original,
      table_number: savedItem.table_number,
      capacity: savedItem.capacity,
      is_active: savedItem.is_active,
      sector: savedItem.sector,
      layout: { ...savedItem.layout },
    };
  });
  return [...current.filter((item) => !used.has(item.id)), ...restored];
}

export function groupFloorPlanAssignments<
  T extends { id: string; status?: string | null },
>(
  reservations: readonly T[],
  assignments: Record<string, string | null>,
  visibleTableIds: ReadonlySet<string>,
) {
  const released = new Set([
    "cancelled",
    "canceled",
    "no_show",
    "completed",
    "archived",
  ]);
  const grouped = new Map<string, T[]>();
  reservations.forEach((reservation) => {
    if (released.has(String(reservation.status || "").toLowerCase())) return;
    const tableId = assignments[reservation.id];
    if (tableId && visibleTableIds.has(tableId))
      grouped.set(tableId, [...(grouped.get(tableId) || []), reservation]);
  });
  return grouped;
}
