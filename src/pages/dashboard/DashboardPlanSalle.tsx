import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Grip,
  Layers,
  LayoutPanelTop,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  Plus,
  Printer,
  Redo2,
  Save,
  Sparkles,
  Store,
  Undo2,
  Users,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import type { AIFloorPlanResult } from "@/components/floor-plan/FloorPlanAIPanel";
import SimpleReservationQueue from "@/components/floor-plan/SimpleReservationQueue";
import ServiceBoard from "@/components/floor-plan/ServiceBoard";
import StudioCanvas from "@/components/floor-plan/StudioCanvas";
import StudioInspector from "@/components/floor-plan/StudioInspector";
import StudioPalette from "@/components/floor-plan/StudioPalette";
import TableConfigDialog from "@/components/floor-plan/TableConfigDialog";
import TableContextDrawer from "@/components/floor-plan/TableContextDrawer";
import { getRecommendedTableByReservation, scoreReservationPlacement } from "@/components/floor-plan/serviceShared";
import type { StudioLibraryTab } from "@/components/floor-plan/studioShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  FLOOR_PLAN_PRESETS,
  buildDraftFloorPlanLayout,
  buildFloorPlanViewportModel,
  clampFloorPlanLayout,
  ensureFloorPlanLayoutFitsCapacity,
  getFloorPlanContentPadding as resolveFloorPlanContentPadding,
  getFloorPlanItemBaseName,
  getLogicalFloorPlanPositionFromRenderedFrame,
  getMinimumFloorPlanResizeSize,
  getResolvedFloorPlanDimensions,
  isReservableFloorPlanItem,
  normalizeFloorPlanLayout,
  reservationsOverlap,
  resolveFloorPlanViewportZoom,
  resizeFloorPlanLayoutToFootprint,
  resizeRenderedFloorPlanFrame,
  updateFloorPlanItemLayoutById,
  type FloorPlanCornerBenchConfig,
  type FloorPlanItemKind,
  type FloorPlanRenderedFrame,
  type FloorPlanResizeHandle,
  type FloorPlanSeatPlacement,
  type FloorPlanSeatType,
  type FloorPlanTableLayout,
  type FloorPlanTablePreset,
  type FloorPlanTableShape,
} from "@/lib/floorPlan";
import {
  DASHBOARD_TIME_RANGE_OPTIONS,
  formatDashboardDateHeading,
  getDashboardTimeRangeBounds,
  getTodayReferenceDate,
  isDateInDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/dashboardTimeRange";
import { formatRestaurantPaymentMethod } from "@/lib/dashboardPayments";
import { getFloorPlanHealthSummary } from "@/lib/floorPlanHealth";
import { createFloorPlanFrameScheduler, createFloorPlanPointerMoveScheduler } from "@/lib/floorPlanFrameScheduler";
import {
  createFloorPlanHistory,
  pushFloorPlanHistory,
  redoFloorPlanHistory,
  resetFloorPlanHistory,
  undoFloorPlanHistory,
  type FloorPlanHistory,
} from "@/lib/floorPlanHistory";
import {
  buildFloorPlanAssignmentSignature,
  hasFloorPlanAssignmentChanges,
} from "@/lib/floorPlanPersistence";
import { updateRestaurantReservationStatus } from "@/lib/reservationMutations";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";

import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReservationWithCustomer = ReservationRow & {
  customer: Pick<ProfileRow, "full_name" | "phone"> | null;
};
type ReservationPreorderItem = {
  menuItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  source: string | null;
  metadata: Record<string, Json>;
};

type BranchRow = {
  id: string;
  restaurant_id: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  is_active: boolean | null;
  created_at?: string | null;
};

type TableConfig = {
  capacity: number;
  shape: FloorPlanTableShape;
  seatType: FloorPlanSeatType;
  seatPlacements: FloorPlanSeatPlacement[];
  cornerBenchConfigs: FloorPlanCornerBenchConfig[];
  tableWidth: number;
  tableHeight: number;
};

type TableRow = {
  id: string;
  branch_id: string;
  table_number: string;
  capacity: number;
  is_active: boolean | null;
  sector: string | null;
  layout: unknown;
};

type SlotRow = {
  id: string;
  reservation_id: string;
  table_id: string;
  created_at?: string | null;
};

type LayoutOverrideRow = {
  id: string;
  reservation_table_id: string;
  branch_id: string;
  service_date: string;
  layout: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

type FloorPlanVariantSnapshotTable = {
  table_number: string;
  capacity: number;
  is_active: boolean;
  sector: string;
  layout: Record<string, Json>;
};

type FloorPlanVariantSnapshot = {
  version: 1;
  canvas: {
    width: number;
    height: number;
  };
  tables: FloorPlanVariantSnapshotTable[];
};

type FloorPlanVariantRow = {
  id: string;
  restaurant_id: string;
  branch_id: string;
  name: string;
  source: "manual" | "ai-image" | "ai-generated";
  snapshot: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type DraftTable = {
  id: string;
  persisted: boolean;
  branch_id: string;
  table_number: string;
  capacity: number;
  is_active: boolean;
  sector: string;
  layout: FloorPlanTableLayout;
};

type ServiceFilter = "all" | "lunch" | "dinner";
type SortBy = "time" | "party_size" | "status";
type ResizeHandle = FloorPlanResizeHandle;
type FloorPlanEditMode = "service" | "template";
type SaveMutationOptions = {
  silent?: boolean;
  source?: "manual" | "auto-layout";
  layoutSignature?: string | null;
};
type RenderedTableFrame = FloorPlanRenderedFrame;
type TableDensity = "tight" | "compact" | "regular";
type FloorPlanHistorySnapshot = {
  tables: DraftTable[];
  assignments: Record<string, string | null>;
  selectedTableId: string | null;
};

const DEFAULT_SECTOR = "Salle principale";
const DEFAULT_COUNTRY = "Suisse";
const CANVAS_WIDTH = 1040;
const CANVAS_HEIGHT = 760;
const MIN_CANVAS_ZOOM = 0.1;
const MAX_CANVAS_ZOOM = 1.8;
const CANVAS_ZOOM_STEP = 0.1;
const PANEL_SNAP_DISTANCE = 24;
const RELEASED_STATUSES = new Set(["cancelled", "canceled", "no_show", "completed", "archived"]);
const FLOOR_PLAN_RESERVATIONS_LIMIT = 500;
const EMPTY_BRANCHES: BranchRow[] = [];
const EMPTY_TABLES: TableRow[] = [];
const EMPTY_RESERVATIONS: ReservationWithCustomer[] = [];
const EMPTY_SLOTS: SlotRow[] = [];
const EMPTY_LAYOUT_OVERRIDES: LayoutOverrideRow[] = [];
const EMPTY_FLOOR_PLAN_VARIANTS: FloorPlanVariantRow[] = [];

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getSafeTime = (value: string | null | undefined) => (value && value.slice(0, 5)) || "00:00";

type DockablePanelPosition = { x: number; y: number };
type DockablePanelSnapTarget = DockablePanelPosition & { width: number; height: number };

function getAutoFitCanvasSize(viewportWidth: number, viewportHeight: number) {
  const availableWidth = Math.floor(viewportWidth);
  const availableHeight = Math.floor(viewportHeight);

  if (availableWidth <= 0 || availableHeight <= 0) {
    return {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    };
  }

  return {
    width: Math.max(1, availableWidth),
    height: Math.max(1, availableHeight),
  };
}

function snapDockablePanelPosition(
  position: DockablePanelPosition,
  size: { width: number; height: number },
  targets: DockablePanelSnapTarget[],
) {
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const minX = 12;
  const minY = 12;
  const maxX = Math.max(minX, viewportWidth - size.width - 12);
  const maxY = Math.max(minY, viewportHeight - size.height - 12);
  let nextX = Math.min(maxX, Math.max(minX, position.x));
  let nextY = Math.min(maxY, Math.max(minY, position.y));

  const snapX = (candidate: number) => {
    if (Math.abs(nextX - candidate) <= PANEL_SNAP_DISTANCE) nextX = candidate;
  };
  const snapY = (candidate: number) => {
    if (Math.abs(nextY - candidate) <= PANEL_SNAP_DISTANCE) nextY = candidate;
  };

  snapX(minX);
  snapX(maxX);
  snapY(minY);
  snapY(maxY);

  targets.forEach((target) => {
    snapX(target.x);
    snapX(target.x + target.width - size.width);
    snapX(target.x + target.width + 8);
    snapX(target.x - size.width - 8);
    snapY(target.y);
    snapY(target.y + target.height - size.height);
    snapY(target.y + target.height + 8);
    snapY(target.y - size.height - 8);
  });

  return {
    x: Math.min(maxX, Math.max(minX, Math.round(nextX))),
    y: Math.min(maxY, Math.max(minY, Math.round(nextY))),
  };
}

function DockableFloorPlanPanel({
  detached,
  position,
  snapTargets = [],
  className,
  children,
  onPositionChange,
}: {
  detached: boolean;
  position: DockablePanelPosition;
  snapTargets?: DockablePanelSnapTarget[];
  className?: string;
  children: ReactNode;
  onPositionChange: (position: DockablePanelPosition) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const startDraggingPanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!detached) return;
    const handle = (event.target as HTMLElement).closest("[data-panel-drag-handle]");
    if (!handle) return;
    const panel = panelRef.current;
    if (!panel) return;

    event.preventDefault();
    panel.setPointerCapture?.(event.pointerId);
    const bounds = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = { x: bounds.left, y: bounds.top };
    const size = { width: bounds.width, height: bounds.height };

    const handleMove = (moveEvent: PointerEvent) => {
      onPositionChange({
        x: startPosition.x + moveEvent.clientX - startX,
        y: startPosition.y + moveEvent.clientY - startY,
      });
    };
    const handleUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      onPositionChange(snapDockablePanelPosition({
        x: startPosition.x + upEvent.clientX - startX,
        y: startPosition.y + upEvent.clientY - startY,
      }, size, snapTargets));
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  if (!detached) {
    return (
      <div className={cn("h-[min(72svh,720px)] min-h-[480px] xl:h-full xl:min-h-0", className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn("fixed z-[90] max-h-[calc(100vh-24px)] min-h-0 w-[min(380px,calc(100vw-24px))]", className)}
      style={{ left: position.x, top: position.y }}
      onPointerDown={startDraggingPanel}
    >
      {children}
    </div>
  );
}

function formatDateOnlyForQuery(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getReservationDateQueryBounds(referenceDate: string, timeRange: DashboardTimeRange) {
  const bounds = getDashboardTimeRangeBounds(referenceDate, timeRange);
  if (!bounds) return null;

  return {
    startIso: formatDateOnlyForQuery(bounds.start),
    endIso: formatDateOnlyForQuery(bounds.end),
  };
}

function getReservationBranchId(reservation: ReservationRow) {
  const branchId = (reservation as Record<string, unknown>).branch_id;
  return typeof branchId === "string" ? branchId : null;
}

function getReservationCustomerLabel(reservation: ReservationWithCustomer) {
  return reservation.customer?.full_name || "Client sans nom";
}

function normalizeReservationFeature(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function getReservationMetadataRecord(reservation: ReservationRow) {
  return isJsonRecord(reservation.metadata) ? reservation.metadata : {};
}

function getReservationFeature(reservation: ReservationRow) {
  const explicitFeature = normalizeReservationFeature(reservation.feature);
  const metadataFeature = normalizeReservationFeature(getReservationMetadataRecord(reservation).feature);

  if (metadataFeature) return metadataFeature;
  if (explicitFeature) return explicitFeature;
  return "standard";
}

function isZeroAttenteReservation(reservation: ReservationRow) {
  return getReservationFeature(reservation) === "zero-attente";
}

function parseReservationNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatReservationCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getReservationPreorderItems(reservation: ReservationRow): ReservationPreorderItem[] {
  const metadata = getReservationMetadataRecord(reservation);
  const rawItems = Array.isArray(reservation.preorder_items)
    ? reservation.preorder_items
    : Array.isArray(metadata.preorder_items)
      ? metadata.preorder_items
      : Array.isArray(metadata.drops)
        ? metadata.drops
        : [];

  return rawItems.flatMap((item) => {
    if (!isJsonRecord(item as Json)) return [];
    const itemRecord = item as Record<string, Json>;

    const itemMetadata = isJsonRecord(itemRecord.metadata) ? itemRecord.metadata : {};
    return [{
      menuItemId: typeof itemRecord.menu_item_id === "string" && itemRecord.menu_item_id.trim() ? itemRecord.menu_item_id : null,
      name: typeof itemRecord.name === "string" && itemRecord.name.trim() ? itemRecord.name : "Article",
      quantity: Math.max(1, Math.round(parseReservationNumber(itemRecord.quantity) || 1)),
      unitPrice: parseReservationNumber(itemRecord.unit_price),
      totalPrice: parseReservationNumber(itemRecord.total_price),
      source: typeof itemRecord.source === "string" && itemRecord.source.trim() ? itemRecord.source : null,
      metadata: itemMetadata,
    }];
  });
}

function getReservationPaymentMethodLabel(reservation: ReservationRow) {
  const metadata = getReservationMetadataRecord(reservation);
  const rawMethod = typeof reservation.payment_method === "string" && reservation.payment_method.trim()
    ? reservation.payment_method
    : typeof metadata.payment_method === "string" && metadata.payment_method.trim()
      ? metadata.payment_method
      : null;

  return formatRestaurantPaymentMethod(rawMethod);
}

function getReservationTotalAmount(reservation: ReservationRow) {
  const metadata = getReservationMetadataRecord(reservation);
  const reservationAmount = parseReservationNumber(reservation.total_amount);
  if (reservationAmount && reservationAmount > 0) return reservationAmount;

  return parseReservationNumber(metadata.total_amount)
    ?? parseReservationNumber(metadata.pre_discount_subtotal)
    ?? 0;
}

function getReservationPaymentDetails(reservation: ReservationRow) {
  const metadata = getReservationMetadataRecord(reservation);
  const paidMetadata = metadata.paid;
  const isPaid = typeof paidMetadata === "boolean"
    ? paidMetadata
    : typeof paidMetadata === "string"
      ? ["true", "1", "yes", "paid"].includes(paidMetadata.trim().toLowerCase())
      : isZeroAttenteReservation(reservation) && getReservationTotalAmount(reservation) > 0;

  const cardBrand = typeof metadata.card_brand === "string" ? metadata.card_brand.trim() : "";
  const cardLast4 = typeof metadata.card_last4 === "string" ? metadata.card_last4.trim() : "";

  return {
    isPaid,
    totalAmount: getReservationTotalAmount(reservation),
    paymentMethod: getReservationPaymentMethodLabel(reservation),
    cardLabel: cardBrand && cardLast4
      ? `${formatRestaurantPaymentMethod(cardBrand) || cardBrand} **** ${cardLast4}`
      : (formatRestaurantPaymentMethod(cardBrand) || null),
    orderReference: typeof reservation.order_reference === "string" && reservation.order_reference.trim()
      ? reservation.order_reference
      : typeof metadata.order_reference === "string" && metadata.order_reference.trim()
        ? metadata.order_reference
        : null,
    checkoutSessionId: typeof metadata.checkout_session_id === "string" && metadata.checkout_session_id.trim()
      ? metadata.checkout_session_id
      : null,
  };
}

function getReservationSpecialRequest(reservation: ReservationRow) {
  const specialRequests = (reservation as Record<string, unknown>).special_requests;
  if (typeof specialRequests === "string" && specialRequests.trim()) {
    return specialRequests.trim();
  }
  return typeof reservation.notes === "string" && reservation.notes.trim()
    ? reservation.notes.trim()
    : null;
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getTableDensity(frame: RenderedTableFrame): TableDensity {
  if (frame.w < 120 || frame.h < 120) return "tight";
  if (frame.w < 190 || frame.h < 155) return "compact";
  return "regular";
}

function getCompactReservationCustomerLabel(
  reservation: ReservationWithCustomer,
  density: TableDensity,
) {
  const fullLabel = getReservationCustomerLabel(reservation).trim();
  if (density === "regular") return fullLabel;

  const parts = fullLabel.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullLabel;

  if (density === "compact") {
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() || ""}.`;
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 10);
  }

  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function getReservationStatusTone(status: string | null | undefined) {
  switch (String(status || "").toLowerCase()) {
    case "confirmed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "arrived":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "seated":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "no_show":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getShortDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getReservationService(reservation: ReservationRow) {
  const metadata = isJsonRecord(reservation.metadata) ? reservation.metadata : {};
  const explicitService = typeof metadata.service === "string" ? metadata.service.toLowerCase() : null;
  if (explicitService === "lunch" || explicitService === "dinner") return explicitService;
  return getServicePeriodFromMetadata(reservation.metadata, reservation.time);
}

function buildSchedule(reservation: ReservationRow) {
  return {
    id: reservation.id,
    date: reservation.date,
    time: reservation.time,
    partySize: Number(reservation.party_size || 0),
    status: reservation.status,
  };
}

function sortReservations(left: ReservationRow, right: ReservationRow, sortBy: SortBy) {
  const byDate = left.date.localeCompare(right.date, "fr");
  if (byDate !== 0) return byDate;

  if (sortBy === "party_size" && left.party_size !== right.party_size) {
    return Number(right.party_size || 0) - Number(left.party_size || 0);
  }

  if (sortBy === "status") {
    const byStatus = String(left.status || "").localeCompare(String(right.status || ""), "fr");
    if (byStatus !== 0) return byStatus;
  }

  return getSafeTime(left.time).localeCompare(getSafeTime(right.time), "fr");
}

function layoutToRecord(layout: FloorPlanTableLayout) {
  return {
    x: Math.round(layout.x),
    y: Math.round(layout.y),
    w: Math.round(layout.w),
    h: Math.round(layout.h),
    rotation: layout.rotation,
    shape: layout.shape,
    kind: layout.kind,
    seat_labels: layout.seatLabels,
    seat_type: layout.seatType || "chair",
    seat_placements: layout.seatPlacements || [],
    corner_bench_corners: layout.cornerBenchCorners || [],
    corner_bench_configs: layout.cornerBenchConfigs || [],
    table_width: layout.tableWidth ? Math.round(layout.tableWidth) : undefined,
    table_height: layout.tableHeight ? Math.round(layout.tableHeight) : undefined,
    corner_bench_horizontal: layout.cornerBenchHorizontal ? Math.round(layout.cornerBenchHorizontal) : undefined,
    corner_bench_vertical: layout.cornerBenchVertical ? Math.round(layout.cornerBenchVertical) : undefined,
    corner_bench_depth: layout.cornerBenchDepth ? Math.round(layout.cornerBenchDepth) : undefined,
  };
}

function buildFloorPlanVariantSnapshot(tables: readonly DraftTable[], canvasWidth: number, canvasHeight: number): FloorPlanVariantSnapshot {
  return {
    version: 1,
    canvas: {
      width: Math.round(canvasWidth),
      height: Math.round(canvasHeight),
    },
    tables: tables.map((table) => ({
      table_number: table.table_number,
      capacity: table.capacity,
      is_active: table.is_active,
      sector: table.sector || DEFAULT_SECTOR,
      layout: layoutToRecord(table.layout) as Record<string, Json>,
    })),
  };
}

function parseFloorPlanVariantSnapshot(value: unknown): FloorPlanVariantSnapshot | null {
  if (!isJsonRecord((value ?? null) as Json)) return null;
  const snapshot = value as Record<string, unknown>;
  const tables = Array.isArray(snapshot.tables) ? snapshot.tables : [];
  const parsedTables = tables.flatMap((entry) => {
    if (!isJsonRecord((entry ?? null) as Json)) return [];
    const row = entry as Record<string, unknown>;
    const layout = isJsonRecord((row.layout ?? null) as Json) ? row.layout as Record<string, Json> : null;
    if (!layout) return [];

    return [{
      table_number: typeof row.table_number === "string" && row.table_number.trim()
        ? row.table_number.trim()
        : "Table",
      capacity: Math.max(0, Math.round(Number(row.capacity) || 0)),
      is_active: typeof row.is_active === "boolean" ? row.is_active : true,
      sector: typeof row.sector === "string" && row.sector.trim() ? row.sector.trim() : DEFAULT_SECTOR,
      layout,
    }];
  });

  return {
    version: 1,
    canvas: {
      width: Number((snapshot.canvas as Record<string, unknown> | undefined)?.width) || CANVAS_WIDTH,
      height: Number((snapshot.canvas as Record<string, unknown> | undefined)?.height) || CANVAS_HEIGHT,
    },
    tables: parsedTables,
  };
}

function buildDraftTablesFromVariant(
  variant: FloorPlanVariantRow,
  branchId: string,
): DraftTable[] {
  const snapshot = parseFloorPlanVariantSnapshot(variant.snapshot);
  if (!snapshot) return [];

  return snapshot.tables.map((table, index) => {
    const layout = buildTemplateLayout(table.layout, index, table.capacity || 0);
    const isReservable = isReservableFloorPlanItem(layout.kind);
    return {
      id: `variant-${variant.id}-${index}-${crypto.randomUUID()}`,
      persisted: false,
      branch_id: branchId,
      table_number: table.table_number,
      capacity: isReservable ? Math.max(1, table.capacity || 2) : 0,
      is_active: table.is_active,
      sector: table.sector || DEFAULT_SECTOR,
      layout,
    };
  });
}

function areLayoutsEquivalent(left: FloorPlanTableLayout, right: FloorPlanTableLayout) {
  return JSON.stringify(layoutToRecord(left)) === JSON.stringify(layoutToRecord(right));
}

function buildTemplateLayout(rawLayout: unknown, fallbackIndex: number, capacity: number) {
  const normalizedLayout = normalizeFloorPlanLayout(rawLayout, fallbackIndex, capacity);
  return ensureFloorPlanLayoutFitsCapacity(
    normalizedLayout,
    capacity,
    normalizedLayout.shape,
    normalizedLayout.kind,
  );
}

function buildServiceLayout(
  templateLayout: FloorPlanTableLayout,
  overrideLayout: unknown,
  fallbackIndex: number,
  capacity: number,
) {
  const overrideRecord = isJsonRecord((overrideLayout ?? null) as Json)
    ? (overrideLayout as Record<string, Json>)
    : {};

  const normalizedOverride = normalizeFloorPlanLayout(
    {
      ...overrideRecord,
      shape: templateLayout.shape,
      kind: templateLayout.kind,
      seat_labels: templateLayout.seatLabels,
    },
    fallbackIndex,
    capacity,
    templateLayout.shape,
    templateLayout.kind,
  );

  return ensureFloorPlanLayoutFitsCapacity(
    {
      ...templateLayout,
      x: normalizedOverride.x,
      y: normalizedOverride.y,
      w: normalizedOverride.w,
      h: normalizedOverride.h,
      rotation: normalizedOverride.rotation,
      shape: templateLayout.shape,
      kind: templateLayout.kind,
      seatLabels: templateLayout.seatLabels,
      seatType: normalizedOverride.seatType ?? templateLayout.seatType,
      seatPlacements: normalizedOverride.seatPlacements ?? templateLayout.seatPlacements,
      cornerBenchCorners: normalizedOverride.cornerBenchCorners ?? templateLayout.cornerBenchCorners,
      cornerBenchConfigs: normalizedOverride.cornerBenchConfigs ?? templateLayout.cornerBenchConfigs,
      tableWidth: normalizedOverride.tableWidth ?? templateLayout.tableWidth,
      tableHeight: normalizedOverride.tableHeight ?? templateLayout.tableHeight,
      cornerBenchHorizontal: normalizedOverride.cornerBenchHorizontal ?? templateLayout.cornerBenchHorizontal,
      cornerBenchVertical: normalizedOverride.cornerBenchVertical ?? templateLayout.cornerBenchVertical,
      cornerBenchDepth: normalizedOverride.cornerBenchDepth ?? templateLayout.cornerBenchDepth,
    },
    capacity,
    templateLayout.shape,
    templateLayout.kind,
  );
}

function getNextPresetLabel(tables: DraftTable[], preset: FloorPlanTablePreset) {
  const baseLabel = getFloorPlanItemBaseName(preset.kind);
  const usedNumbers = new Set(
    tables
      .filter((table) => table.table_number.startsWith(baseLabel))
      .map((table) => Number.parseInt(String(table.table_number).replace(/[^\d]/g, ""), 10))
      .filter((value) => Number.isFinite(value)),
  );

  let candidate = 1;
  while (usedNumbers.has(candidate)) {
    candidate += 1;
  }

  return `${baseLabel} ${candidate}`;
}

function clampCanvasZoom(value: number) {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number(value.toFixed(2))));
}

function getTableContentPadding(
  layout: FloorPlanTableLayout,
  capacity: number,
  zoom: number,
) {
  return resolveFloorPlanContentPadding(layout, capacity, zoom);
}

function getReservationStatusLabel(status: string) {
  switch (status) {
    case "arrived":
      return "arrive";
    case "seated":
      return "installe";
    case "no_show":
      return "no-show";
    case "confirmed":
      return "confirme";
    case "pending":
      return "en attente";
    default:
      return status;
  }
}

function cloneDraftTables(tables: readonly DraftTable[]) {
  return tables.map((table) => ({
    ...table,
    layout: JSON.parse(JSON.stringify(table.layout)) as FloorPlanTableLayout,
  }));
}

function cloneHistorySnapshot(snapshot: FloorPlanHistorySnapshot): FloorPlanHistorySnapshot {
  return {
    tables: cloneDraftTables(snapshot.tables),
    assignments: { ...snapshot.assignments },
    selectedTableId: snapshot.selectedTableId,
  };
}

function getHistorySnapshotSignature(snapshot: FloorPlanHistorySnapshot) {
  return JSON.stringify({
    tables: snapshot.tables,
    assignments: snapshot.assignments,
    selectedTableId: snapshot.selectedTableId,
  });
}

function areHistorySnapshotsEqual(current: FloorPlanHistorySnapshot, next: FloorPlanHistorySnapshot) {
  return getHistorySnapshotSignature(current) === getHistorySnapshotSignature(next);
}

function isReservableDraftTable(table: DraftTable | null | undefined) {
  return !!table && isReservableFloorPlanItem(table.layout.kind);
}

function getPersistableCapacity(table: DraftTable) {
  return isReservableDraftTable(table)
    ? Math.max(1, Math.round(table.capacity || 1))
    : 0;
}

export default function DashboardPlanSalle() {
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSavedLayoutSignatureRef = useRef<string | null>(null);
  const scheduledAutoSaveLayoutSignatureRef = useRef<string | null>(null);
  const assignReservationToTableRef = useRef<(reservationId: string, tableId: string) => void>(() => undefined);
  const getVisibleTableAtPointRef = useRef<(x: number, y: number) => DraftTable | null>(() => null);
  const draftTablesRef = useRef<DraftTable[]>([]);
  const draftAssignmentsRef = useRef<Record<string, string | null>>({});
  const selectedTableIdRef = useRef<string | null>(null);

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState(DEFAULT_SECTOR);
  const [extraSectors, setExtraSectors] = useState<string[]>([]);
  const [newSectorName, setNewSectorName] = useState("");
  const [referenceDate, setReferenceDate] = useState(getTodayReferenceDate());
  const [editMode, setEditMode] = useState<FloorPlanEditMode>("service");
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("day");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [reservationQuery, setReservationQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryTab, setLibraryTab] = useState<StudioLibraryTab>("tables");
  const [toolPanelTab, setToolPanelTab] = useState<"library" | "inspector">("library");
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [draftTables, setDraftTables] = useState<DraftTable[]>([]);
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string | null>>({});
  const [floorPlanHistory, setFloorPlanHistory] = useState<FloorPlanHistory<FloorPlanHistorySnapshot>>(() => (
    createFloorPlanHistory({ tables: [], assignments: {}, selectedTableId: null })
  ));
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    tableId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resizeState, setResizeState] = useState<{
    tableId: string;
    pointerId: number;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startLayout: FloorPlanTableLayout;
    startFrame: RenderedTableFrame;
  } | null>(null);
  const [draggedReservationId, setDraggedReservationId] = useState<string | null>(null);
  const [dragOverTableId, setDragOverTableId] = useState<string | null>(null);
  const [reservationPointerDrag, setReservationPointerDrag] = useState<{
    reservationId: string;
    pointerId: number;
  } | null>(null);
  const [reservationPointerPosition, setReservationPointerPosition] = useState<{
    clientX: number;
    clientY: number;
  } | null>(null);
  const [rotateState, setRotateState] = useState<{
    tableId: string;
    pointerId: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasWidth, setCanvasWidth] = useState(CANVAS_WIDTH);
  const [canvasHeight, setCanvasHeight] = useState(CANVAS_HEIGHT);
  const [serviceQueueCollapsed, setServiceQueueCollapsed] = useState(false);
  const [serviceQueueDetached, setServiceQueueDetached] = useState(false);
  const [serviceQueuePosition, setServiceQueuePosition] = useState<DockablePanelPosition>({ x: 1190, y: 210 });
  const [toolsPanelCollapsed, setToolsPanelCollapsed] = useState(false);
  const [toolsPanelDetached, setToolsPanelDetached] = useState(false);
  const [toolsPanelPosition, setToolsPanelPosition] = useState<DockablePanelPosition>({ x: 1160, y: 220 });
  const [tableConfigDialogOpen, setTableConfigDialogOpen] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const [editingSeatingTableId, setEditingSeatingTableId] = useState<string | null>(null);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const canUndoFloorPlan = floorPlanHistory.past.length > 0;
  const canRedoFloorPlan = floorPlanHistory.future.length > 0;
  const buildHistorySnapshot = (
    tables = draftTablesRef.current,
    assignments = draftAssignmentsRef.current,
    tableId = selectedTableIdRef.current,
  ): FloorPlanHistorySnapshot => ({
    tables: cloneDraftTables(tables),
    assignments: { ...assignments },
    selectedTableId: tableId,
  });
  const applyHistorySnapshot = (snapshot: FloorPlanHistorySnapshot) => {
    const nextSnapshot = cloneHistorySnapshot(snapshot);
    draftTablesRef.current = nextSnapshot.tables;
    draftAssignmentsRef.current = nextSnapshot.assignments;
    selectedTableIdRef.current = nextSnapshot.selectedTableId;
    setDraftTables(nextSnapshot.tables);
    setDraftAssignments(nextSnapshot.assignments);
    setSelectedTableId(nextSnapshot.selectedTableId);
    setDragState(null);
    setResizeState(null);
    setRotateState(null);
    setDraggedReservationId(null);
    setDragOverTableId(null);
    setReservationPointerDrag(null);
    setReservationPointerPosition(null);
  };
  const commitHistorySnapshot = (snapshot: FloorPlanHistorySnapshot) => {
    const nextSnapshot = cloneHistorySnapshot(snapshot);
    setFloorPlanHistory((current) => pushFloorPlanHistory(current, nextSnapshot, { isEqual: areHistorySnapshotsEqual }));
    applyHistorySnapshot(nextSnapshot);
  };
  const undoFloorPlan = () => {
    const nextHistory = undoFloorPlanHistory(floorPlanHistory);
    if (nextHistory === floorPlanHistory) return;
    setFloorPlanHistory(nextHistory);
    applyHistorySnapshot(nextHistory.present);
  };
  const redoFloorPlan = () => {
    const nextHistory = redoFloorPlanHistory(floorPlanHistory);
    if (nextHistory === floorPlanHistory) return;
    setFloorPlanHistory(nextHistory);
    applyHistorySnapshot(nextHistory.present);
  };
  const syncCanvasSizeFromViewport = useCallback((width: number, height: number) => {
    const nextSize = getAutoFitCanvasSize(width, height);
    setCanvasWidth((current) => (current === nextSize.width ? current : nextSize.width));
    setCanvasHeight((current) => (current === nextSize.height ? current : nextSize.height));
  }, []);

  useEffect(() => {
    draftTablesRef.current = draftTables;
  }, [draftTables]);

  useEffect(() => {
    draftAssignmentsRef.current = draftAssignments;
  }, [draftAssignments]);

  useEffect(() => {
    selectedTableIdRef.current = selectedTableId;
  }, [selectedTableId]);

  const { data: restaurantDetails } = useQuery({
    queryKey: ["floor-plan-restaurant", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!selectedId,
  });

  const { data: branchesData, isLoading: branchesLoading, error: branchesError } = useQuery({
    queryKey: ["floor-plan-branches", selectedId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurant_branches" as any))
        .select("*")
        .eq("restaurant_id", selectedId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BranchRow[];
    },
    enabled: !!selectedId,
  });
  const branches = branchesData ?? EMPTY_BRANCHES;

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) || null;

  const { data: floorPlanVariantsData, error: floorPlanVariantsError } = useQuery({
    queryKey: ["floor-plan-variants", selectedBranchId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("floor_plan_variants" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FloorPlanVariantRow[];
    },
    enabled: !!selectedBranchId,
  });
  const floorPlanVariants = floorPlanVariantsData ?? EMPTY_FLOOR_PLAN_VARIANTS;
  const activeVariant = activeVariantId
    ? floorPlanVariants.find((variant) => variant.id === activeVariantId) || null
    : null;

  const { data: persistedTablesData, isLoading: tablesLoading, error: tablesError } = useQuery({
    queryKey: ["floor-plan-tables", selectedBranchId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("reservation_tables" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("table_number", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TableRow[];
    },
    enabled: !!selectedBranchId,
  });
  const persistedTables = persistedTablesData ?? EMPTY_TABLES;

  const { data: layoutOverridesData, error: layoutOverridesError } = useQuery({
    queryKey: ["floor-plan-layout-overrides", selectedBranchId, referenceDate],
    queryFn: async () => {
      const { data, error } = await (supabase.from("reservation_table_layout_overrides" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .eq("service_date", referenceDate)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LayoutOverrideRow[];
    },
    enabled: !!selectedBranchId,
  });
  const layoutOverrides = layoutOverridesData ?? EMPTY_LAYOUT_OVERRIDES;
  const reservationDateBounds = useMemo(
    () => getReservationDateQueryBounds(referenceDate, timeRange),
    [referenceDate, timeRange],
  );

  const { data: reservationsData, isLoading: reservationsLoading, error: reservationsError } = useQuery({
    queryKey: ["floor-plan-reservations", selectedId, referenceDate, timeRange],
    queryFn: async () => {
      let reservationsQuery = supabase
        .from("reservations")
        .select("*")
        .eq("restaurant_id", selectedId!);

      if (reservationDateBounds) {
        reservationsQuery = reservationsQuery
          .gte("date", reservationDateBounds.startIso)
          .lt("date", reservationDateBounds.endIso);
      }

      const { data: reservationRows, error: reservationError } = await reservationsQuery
        .order("date", { ascending: true })
        .order("time", { ascending: true })
        .limit(FLOOR_PLAN_RESERVATIONS_LIMIT);

      if (reservationError) throw reservationError;
      if (!reservationRows?.length) return [] as ReservationWithCustomer[];

      const { data: profilesData } = await supabase.rpc("get_reservation_customers" as any, {
        p_restaurant_id: selectedId!,
      });
      const profilesByUserId = new Map(
        (profilesData || []).map((profile: any) => [
          profile.user_id,
          { full_name: profile.full_name, phone: profile.phone },
        ]),
      );

      return reservationRows.map((reservation) => ({
        ...reservation,
        customer: (profilesByUserId.get(reservation.user_id) as Pick<ProfileRow, "full_name" | "phone">) || null,
      })) as ReservationWithCustomer[];
    },
    enabled: !!selectedId,
  });
  const reservations = reservationsData ?? EMPTY_RESERVATIONS;

  const persistedTableIds = useMemo(() => persistedTables.map((table) => table.id), [persistedTables]);
  const layoutOverridesByTableId = useMemo(
    () => new Map(layoutOverrides.map((row) => [row.reservation_table_id, row])),
    [layoutOverrides],
  );
  const resolvedLayoutsByTableId = useMemo(() => new Map(
    persistedTables.map((table, index) => {
      const rawCapacity = Number(table.capacity);
      const fallbackCapacity = Number.isFinite(rawCapacity) ? rawCapacity : 2;
      const templateLayout = buildTemplateLayout(table.layout, index, fallbackCapacity);
      const capacity = isReservableFloorPlanItem(templateLayout.kind)
        ? Math.max(1, Math.round(fallbackCapacity || 2))
        : 0;
      const overrideLayout = layoutOverridesByTableId.get(table.id)?.layout;

      return [table.id, editMode === "service" && overrideLayout
        ? buildServiceLayout(templateLayout, overrideLayout, index, capacity)
        : templateLayout];
    }),
  ), [editMode, layoutOverridesByTableId, persistedTables]);

  const { data: reservationSlotsData, error: slotsError } = useQuery({
    queryKey: ["floor-plan-slots", selectedBranchId, persistedTableIds.join(",")],
    queryFn: async () => {
      const { data, error } = await (supabase.from("reservation_slots" as any))
        .select("*")
        .in("table_id", persistedTableIds);
      if (error) throw error;
      return (data || []) as unknown as SlotRow[];
    },
    enabled: !!selectedBranchId && persistedTableIds.length > 0,
  });
  const reservationSlots = reservationSlotsData ?? EMPTY_SLOTS;

  useEffect(() => {
    if (!branches.length) {
      setSelectedBranchId(null);
      return;
    }

    if (!selectedBranchId || !branches.some((branch) => branch.id === selectedBranchId)) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  useEffect(() => {
    setActiveVariantId(null);
    if (!selectedBranchId) {
      setDraftTables([]);
      setExtraSectors([]);
      setDraftAssignments({});
      draftTablesRef.current = [];
      draftAssignmentsRef.current = {};
      selectedTableIdRef.current = null;
      setFloorPlanHistory((current) => resetFloorPlanHistory(current, {
        tables: [],
        assignments: {},
        selectedTableId: null,
      }));
      return;
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }
    const nextTables = persistedTables.map((table, index) => {
        const rawCapacity = Number(table.capacity);
        const fallbackCapacity = Number.isFinite(rawCapacity) ? rawCapacity : 2;
        const layout = resolvedLayoutsByTableId.get(table.id) || buildTemplateLayout(table.layout, index, fallbackCapacity);
        const capacity = isReservableFloorPlanItem(layout.kind)
          ? Math.max(1, Math.round(fallbackCapacity || 2))
          : 0;

        return {
          id: table.id,
          persisted: true,
          branch_id: table.branch_id,
          table_number: table.table_number,
          capacity,
          is_active: table.is_active ?? true,
          sector: table.sector?.trim() || DEFAULT_SECTOR,
          layout,
        };
      });
    draftTablesRef.current = nextTables;
    setDraftTables(nextTables);
    setFloorPlanHistory((current) => resetFloorPlanHistory(current, {
      ...current.present,
      tables: cloneDraftTables(nextTables),
      selectedTableId: null,
    }));
    setExtraSectors([]);
  }, [persistedTables, resolvedLayoutsByTableId, selectedBranchId]);

  useEffect(() => {
    const nextAssignments = Object.fromEntries(
      reservationSlots.map((slot) => [slot.reservation_id, slot.table_id]),
    ) as Record<string, string | null>;
    draftAssignmentsRef.current = nextAssignments;
    setDraftAssignments(nextAssignments);
    setFloorPlanHistory((current) => resetFloorPlanHistory(current, {
      ...current.present,
      assignments: { ...nextAssignments },
      selectedTableId: null,
    }));
  }, [reservationSlots, selectedBranchId]);

  const sectorOptions = useMemo(() => {
    const values = new Set<string>([DEFAULT_SECTOR]);
    draftTables.forEach((table) => values.add(table.sector));
    extraSectors.forEach((sector) => values.add(sector));
    return Array.from(values).sort((left, right) => left.localeCompare(right, "fr"));
  }, [draftTables, extraSectors]);

  useEffect(() => {
    if (!sectorOptions.includes(selectedSector)) {
      setSelectedSector(sectorOptions[0] || DEFAULT_SECTOR);
    }
  }, [sectorOptions, selectedSector]);

  const branchScopedReservations = useMemo(() => (
    reservations.filter((reservation) => {
      const branchId = getReservationBranchId(reservation);
      if (!selectedBranchId) return false;
      return !branchId || branchId === selectedBranchId;
    })
  ), [reservations, selectedBranchId]);

  const reservationsById = useMemo(
    () => new Map(branchScopedReservations.map((reservation) => [reservation.id, reservation])),
    [branchScopedReservations],
  );

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(branchScopedReservations.map((reservation) => String(reservation.status || "pending"))));
    return ["all", ...statuses.sort((left, right) => left.localeCompare(right, "fr"))];
  }, [branchScopedReservations]);
  const deferredReservationQuery = useDeferredValue(reservationQuery);
  const deferredLibraryQuery = useDeferredValue(libraryQuery);
  const normalizedReservationQuery = normalizeSearchText(deferredReservationQuery);
  const normalizedLibraryQuery = normalizeSearchText(deferredLibraryQuery);

  const filteredReservations = useMemo(() => (
    branchScopedReservations
      .filter((reservation) => {
        if (!isDateInDashboardTimeRange(reservation.date, timeRange, referenceDate, { dateOnly: true })) return false;
        if (serviceFilter !== "all" && getReservationService(reservation) !== serviceFilter) return false;
        if (statusFilter !== "all" && String(reservation.status || "pending") !== statusFilter) return false;
        if (normalizedReservationQuery) {
          const searchableContent = normalizeSearchText([
            getReservationCustomerLabel(reservation),
            reservation.customer?.phone || "",
            reservation.date,
            getSafeTime(reservation.time),
            String(reservation.party_size || ""),
            String(reservation.status || "pending"),
            getServicePeriodLabel(getReservationService(reservation)),
            getReservationSpecialRequest(reservation) || "",
          ].join(" "));

          if (!searchableContent.includes(normalizedReservationQuery)) return false;
        }
        return true;
      })
      .sort((left, right) => sortReservations(left, right, sortBy))
  ), [branchScopedReservations, normalizedReservationQuery, referenceDate, serviceFilter, sortBy, statusFilter, timeRange]);

  const effectiveCanvasZoom = useMemo(
    () => resolveFloorPlanViewportZoom(canvasZoom, canvasWidth, canvasHeight),
    [canvasHeight, canvasWidth, canvasZoom],
  );

  const floorPlanViewport = useMemo(
    () => buildFloorPlanViewportModel(draftTables, {
      sector: selectedSector,
      zoom: effectiveCanvasZoom,
      canvasWidth,
      canvasHeight,
    }),
    [canvasHeight, canvasWidth, draftTables, effectiveCanvasZoom, selectedSector],
  );
  const visibleTables = floorPlanViewport.visibleItems;
  const visibleReservableTables = floorPlanViewport.visibleReservableItems;
  const getRenderedDraftTableFrame = useCallback((table: DraftTable) => (
    floorPlanViewport.getRenderedFrame(table)
  ), [floorPlanViewport]);

  const tableMap = useMemo(
    () => new Map(draftTables.map((table) => [table.id, table])),
    [draftTables],
  );

  const visibleTableIdSet = floorPlanViewport.visibleItemIdSet;
  const visibleReservableTableIdSet = floorPlanViewport.visibleReservableIdSet;

  const visibleAssignmentsByTable = useMemo(() => {
    const grouped = new Map<string, ReservationWithCustomer[]>();
    filteredReservations.forEach((reservation) => {
      const tableId = draftAssignments[reservation.id];
      if (!tableId || !visibleReservableTableIdSet.has(tableId)) return;
      grouped.set(tableId, [...(grouped.get(tableId) || []), reservation]);
    });

    grouped.forEach((items, tableId) => {
      grouped.set(tableId, [...items].sort((left, right) => sortReservations(left, right, "time")));
    });

    return grouped;
  }, [draftAssignments, filteredReservations, visibleReservableTableIdSet]);

  const activeServiceReservationId = draggedReservationId || selectedReservationId;
  const activeServiceReservation = activeServiceReservationId ? reservationsById.get(activeServiceReservationId) || null : null;
  const selectedReservation = selectedReservationId ? reservationsById.get(selectedReservationId) || null : null;
  const pointerDraggedReservation = reservationPointerDrag ? reservationsById.get(reservationPointerDrag.reservationId) || null : null;
  const selectedReservationPreorderItems = useMemo(
    () => (selectedReservation ? getReservationPreorderItems(selectedReservation) : []),
    [selectedReservation],
  );
  const selectedReservationPaymentDetails = useMemo(
    () => (selectedReservation ? getReservationPaymentDetails(selectedReservation) : null),
    [selectedReservation],
  );
  const selectedReservationSpecialRequest = useMemo(
    () => (selectedReservation ? getReservationSpecialRequest(selectedReservation) : null),
    [selectedReservation],
  );
  const selectedTable = selectedTableId ? tableMap.get(selectedTableId) || null : null;
  const selectedTableIsReservable = isReservableDraftTable(selectedTable);
  const selectedTableDimensions = useMemo(() => {
    if (!selectedTable || !selectedTableIsReservable) return null;
    return getResolvedFloorPlanDimensions({
      capacity: selectedTable.capacity,
      shape: selectedTable.layout.shape,
      kind: selectedTable.layout.kind,
      seatType: selectedTable.layout.seatType,
      seatPlacements: selectedTable.layout.seatPlacements,
      cornerBenchCorners: selectedTable.layout.cornerBenchCorners,
      cornerBenchConfigs: selectedTable.layout.cornerBenchConfigs,
      tableWidth: selectedTable.layout.tableWidth,
      tableHeight: selectedTable.layout.tableHeight,
      footprintWidth: selectedTable.layout.w,
      footprintHeight: selectedTable.layout.h,
      cornerBenchHorizontal: selectedTable.layout.cornerBenchHorizontal,
      cornerBenchVertical: selectedTable.layout.cornerBenchVertical,
      cornerBenchDepth: selectedTable.layout.cornerBenchDepth,
    });
  }, [selectedTable, selectedTableIsReservable]);
  const selectedTableAssignments = useMemo(() => {
    if (!selectedTableId || !selectedTableIsReservable) return [];
    return (visibleAssignmentsByTable.get(selectedTableId) || []).slice(0, 6);
  }, [selectedTableId, selectedTableIsReservable, visibleAssignmentsByTable]);

  const assignedVisibleTableIds = useMemo(() => {
    const values = new Set<string>();
    filteredReservations.forEach((reservation) => {
      const tableId = draftAssignments[reservation.id];
      if (tableId && visibleReservableTableIdSet.has(tableId)) {
        values.add(tableId);
      }
    });
    return values;
  }, [draftAssignments, filteredReservations, visibleReservableTableIdSet]);

  const unassignedVisibleReservations = useMemo(
    () => filteredReservations.filter((reservation) => !draftAssignments[reservation.id]),
    [draftAssignments, filteredReservations],
  );
  const libraryPresets = useMemo(() => ({
    tables: FLOOR_PLAN_PRESETS.filter((preset) => preset.category === "table"),
    seating: FLOOR_PLAN_PRESETS.filter((preset) => ["chair", "stool", "corner-bench", "banquette", "booth"].includes(preset.kind)),
    structure: FLOOR_PLAN_PRESETS.filter((preset) => ["bar", "host-stand", "divider", "service-station"].includes(preset.kind)),
    decor: FLOOR_PLAN_PRESETS.filter((preset) => ["plant"].includes(preset.kind)),
  }), []);
  const filteredLibraryPresets = useMemo(() => ({
    tables: libraryPresets.tables.filter((preset) => {
      if (!normalizedLibraryQuery) return true;
      return normalizeSearchText([preset.label, preset.description, preset.kind].join(" ")).includes(normalizedLibraryQuery);
    }),
    seating: libraryPresets.seating.filter((preset) => {
      if (!normalizedLibraryQuery) return true;
      return normalizeSearchText([preset.label, preset.description, preset.kind].join(" ")).includes(normalizedLibraryQuery);
    }),
    structure: libraryPresets.structure.filter((preset) => {
      if (!normalizedLibraryQuery) return true;
      return normalizeSearchText([preset.label, preset.description, preset.kind].join(" ")).includes(normalizedLibraryQuery);
    }),
    decor: libraryPresets.decor.filter((preset) => {
      if (!normalizedLibraryQuery) return true;
      return normalizeSearchText([preset.label, preset.description, preset.kind].join(" ")).includes(normalizedLibraryQuery);
    }),
  }), [libraryPresets.decor, libraryPresets.seating, libraryPresets.structure, libraryPresets.tables, normalizedLibraryQuery]);

  const isTemplateMode = editMode === "template";

  useEffect(() => {
    if (isTemplateMode && selectedTableId) {
      setToolPanelTab("inspector");
    }
  }, [isTemplateMode, selectedTableId]);
  const hasUnpersistedDraftTables = draftTables.some((table) => !table.persisted);
  const serviceLayoutSignature = useMemo(() => JSON.stringify(
    draftTables
      .filter((table) => table.persisted)
      .map((table) => ({
        id: table.id,
        layout: layoutToRecord(table.layout),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, "fr")),
  ), [draftTables]);
  const serviceAssignmentSignature = useMemo(
    () => buildFloorPlanAssignmentSignature(draftAssignments, reservationSlots),
    [draftAssignments, reservationSlots],
  );
  const servicePersistenceSignature = useMemo(() => JSON.stringify({
    assignments: serviceAssignmentSignature,
    layout: serviceLayoutSignature,
  }), [serviceAssignmentSignature, serviceLayoutSignature]);
  const serviceLayoutDirty = useMemo(() => {
    if (isTemplateMode) return false;
    if (hasUnpersistedDraftTables) return false;

    return draftTables.some((table) => {
      if (!table.persisted) return false;
      const resolvedLayout = resolvedLayoutsByTableId.get(table.id);
      if (!resolvedLayout) return false;
      return !areLayoutsEquivalent(table.layout, resolvedLayout);
    });
  }, [draftTables, hasUnpersistedDraftTables, isTemplateMode, resolvedLayoutsByTableId]);
  const serviceAssignmentsDirty = useMemo(() => {
    if (isTemplateMode) return false;
    if (hasUnpersistedDraftTables) return false;
    return hasFloorPlanAssignmentChanges(draftAssignments, reservationSlots);
  }, [draftAssignments, hasUnpersistedDraftTables, isTemplateMode, reservationSlots]);
  const serviceDirty = serviceLayoutDirty || serviceAssignmentsDirty;
  const availableTables = visibleReservableTables.filter((table) => !assignedVisibleTableIds.has(table.id));
  const assignedVisibleReservations = filteredReservations.filter((reservation) => !!draftAssignments[reservation.id]);
  const canPersist = !!selectedBranchId && (isTemplateMode || !hasUnpersistedDraftTables);
  const canvasZoomLabel = `${Math.round(effectiveCanvasZoom * 100)}%`;
  const selectedReservationAssignedTableDropState = selectedReservation && selectedTable && selectedTableIsReservable
    ? getReservationDropState(selectedReservation.id, selectedTable.id)
    : null;
  const compatibleTablesForSelectedReservation = selectedReservation
    ? visibleReservableTables
      .filter((table) => getReservationDropState(selectedReservation.id, table.id).ok)
      .map((table) => ({
        table,
        placement: scoreReservationPlacement({
          reservation: selectedReservation,
          table,
          currentTableLoad: getTableAssignmentLoad(table.id, draftAssignments),
          currentTableReservations: getTableAssignedReservations(table.id, draftAssignments),
        }),
      }))
      .sort((left, right) => (
        right.placement.score - left.placement.score
        || left.table.capacity - right.table.capacity
        || left.table.table_number.localeCompare(right.table.table_number, "fr")
      ))
      .slice(0, 6)
    : [];
  const serviceQueueSnapTargets = toolsPanelDetached
    ? [{ ...toolsPanelPosition, width: toolsPanelCollapsed ? 72 : 380, height: toolsPanelCollapsed ? 220 : 620 }]
    : [];
  const toolsPanelSnapTargets = serviceQueueDetached
    ? [{ ...serviceQueuePosition, width: serviceQueueCollapsed ? 72 : 380, height: serviceQueueCollapsed ? 220 : 620 }]
    : [];
  const recommendedTablesByReservationId = useMemo(() => {
    const getCurrentTableReservations = (tableId: string) => branchScopedReservations.filter((candidate) => {
      if (RELEASED_STATUSES.has(String(candidate.status || "").toLowerCase())) return false;
      return draftAssignments[candidate.id] === tableId;
    });

    return getRecommendedTableByReservation({
      reservations: unassignedVisibleReservations,
      tables: visibleReservableTables,
      getReservationDropState: (reservationId, tableId) => {
        const reservation = reservationsById.get(reservationId);
        const table = tableMap.get(tableId);

        if (!reservation || !table) {
          return { ok: false, reason: "Reservation ou table introuvable." };
        }

        if (!isReservableDraftTable(table)) {
          return {
            ok: false,
            reason: `${table.table_number} est un meuble decoratif. Choisissez une vraie table.`,
          };
        }

        if (reservation.party_size > table.capacity) {
          return {
            ok: false,
            reason: `${table.table_number} ne peut pas accueillir ${reservation.party_size} personnes.`,
          };
        }

        const targetSchedule = buildSchedule(reservation);
        const conflictingReservation = branchScopedReservations.find((candidate) => {
          if (candidate.id === reservationId) return false;
          if (RELEASED_STATUSES.has(String(candidate.status || "").toLowerCase())) return false;
          if (draftAssignments[candidate.id] !== tableId) return false;
          return reservationsOverlap(targetSchedule, buildSchedule(candidate));
        });

        if (conflictingReservation) {
          return {
            ok: false,
            reason: `${table.table_number} est déjà pris autour de ${getSafeTime(conflictingReservation.time)}.`,
          };
        }

        return { ok: true, reason: null };
      },
      getPlacementScore: (reservation, table) => {
        const currentTableReservations = getCurrentTableReservations(table.id);

        return scoreReservationPlacement({
          reservation,
          table,
          currentTableLoad: currentTableReservations.length,
          currentTableReservations,
        });
      },
    });
  }, [
    branchScopedReservations,
    draftAssignments,
    reservationsById,
    tableMap,
    unassignedVisibleReservations,
    visibleReservableTables,
  ]);
  const compatibleReservationsForSelectedTable = selectedTable && selectedTableIsReservable
    ? unassignedVisibleReservations
      .filter((reservation) => getReservationDropState(reservation.id, selectedTable.id).ok)
      .slice(0, 6)
    : [];

  const getCanvasPointFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const bounds = canvas.getBoundingClientRect();
    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
  };

  const getVisibleTableAtPoint = (x: number, y: number) => {
    return floorPlanViewport.getReservableItemAtPoint(x, y);
  };

  useEffect(() => {
    if (!dragState && !resizeState && !rotateState) return undefined;

    const applyPointerMove = (point: { x: number; y: number }) => {
      if (rotateState) {
        const table = tableMap.get(rotateState.tableId);
        if (table) {
          const frame = getRenderedDraftTableFrame(table);
          const cx = frame.x + frame.w / 2;
          const cy = frame.y + frame.h / 2;
          const currentAngle = Math.atan2(point.y - cy, point.x - cx) * (180 / Math.PI);
          const delta = currentAngle - rotateState.startAngle;
          const snapped = Math.round((rotateState.startRotation + delta) / 15) * 15;
          const normalized = ((snapped % 360) + 360) % 360;
          setDraftTables((current) => {
            const next = updateFloorPlanItemLayoutById(current, rotateState.tableId, (layout) => ({
              ...layout,
              rotation: normalized,
            }));
            draftTablesRef.current = next;
            return next;
          });
        }
      }

      if (dragState) {
        const nextRenderedX = point.x - dragState.offsetX;
        const nextRenderedY = point.y - dragState.offsetY;

        setDraftTables((current) => {
          const next = updateFloorPlanItemLayoutById(current, dragState.tableId, (layout) => {
            const nextPosition = getLogicalFloorPlanPositionFromRenderedFrame(
              layout,
              nextRenderedX,
              nextRenderedY,
              effectiveCanvasZoom,
              canvasWidth,
              canvasHeight,
              floorPlanViewport.anchor,
            );
            return {
              ...layout,
              x: nextPosition.x,
              y: nextPosition.y,
            };
          });
          draftTablesRef.current = next;
          return next;
        });
      }

      if (resizeState) {
        const deltaX = point.x - resizeState.startX;
        const deltaY = point.y - resizeState.startY;

        setDraftTables((current) => {
          const next = updateFloorPlanItemLayoutById(current, resizeState.tableId, (layout, table) => {
            const minimumSize = getMinimumFloorPlanResizeSize(resizeState.startLayout.kind);
            const resizedFrame = resizeRenderedFloorPlanFrame(
              resizeState.startFrame,
              resizeState.handle,
              deltaX,
              deltaY,
              minimumSize.w * effectiveCanvasZoom,
              minimumSize.h * effectiveCanvasZoom,
            );
            const resizedLayout = resizeFloorPlanLayoutToFootprint(
              resizeState.startLayout,
              table.capacity,
              resizedFrame.w / effectiveCanvasZoom,
              resizedFrame.h / effectiveCanvasZoom,
              resizeState.startLayout.shape,
              resizeState.startLayout.kind,
            );
            const nextPosition = getLogicalFloorPlanPositionFromRenderedFrame(
              resizedLayout,
              resizedFrame.x,
              resizedFrame.y,
              effectiveCanvasZoom,
              canvasWidth,
              canvasHeight,
              floorPlanViewport.anchor,
            );
            return {
              ...resizedLayout,
              x: nextPosition.x,
              y: nextPosition.y,
            };
          });
          draftTablesRef.current = next;
          return next;
        });
      }
    };
    const pointerMoveScheduler = createFloorPlanFrameScheduler(applyPointerMove);

    const activePointerId = dragState?.pointerId ?? resizeState?.pointerId ?? rotateState?.pointerId;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      if (!point) return;
      pointerMoveScheduler.schedule(point);
    };

    const finishPointerInteraction = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      pointerMoveScheduler.flush();
      const activeTableId = dragState?.tableId || resizeState?.tableId || rotateState?.tableId || selectedTableIdRef.current;
      const nextSnapshot = buildHistorySnapshot(draftTablesRef.current, draftAssignmentsRef.current, activeTableId);
      setFloorPlanHistory((current) => pushFloorPlanHistory(current, nextSnapshot, { isEqual: areHistorySnapshotsEqual }));
      setDragState(null);
      setResizeState(null);
      setRotateState(null);
      selectedTableIdRef.current = activeTableId;
      setSelectedTableId(activeTableId);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointerInteraction);
    window.addEventListener("pointercancel", finishPointerInteraction);

    return () => {
      pointerMoveScheduler.cancel();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerInteraction);
      window.removeEventListener("pointercancel", finishPointerInteraction);
    };
  }, [canvasHeight, canvasWidth, dragState, effectiveCanvasZoom, floorPlanViewport.anchor, getRenderedDraftTableFrame, resizeState, rotateState, tableMap]);

  useEffect(() => {
    if (!reservationPointerDrag) return undefined;

    const clearReservationPointerDrag = () => {
      setReservationPointerDrag(null);
      setReservationPointerPosition(null);
      setDraggedReservationId(null);
      setDragOverTableId(null);
    };

    const pointerMoveScheduler = createFloorPlanPointerMoveScheduler(({ clientX, clientY }) => {
      setReservationPointerPosition({
        clientX,
        clientY,
      });

      const point = getCanvasPointFromClient(clientX, clientY);
      const hoveredTable = point ? getVisibleTableAtPointRef.current(point.x, point.y) : null;
      setDragOverTableId(hoveredTable?.id || null);
    });

    const handlePointerMove = (event: PointerEvent) => {
      pointerMoveScheduler.scheduleFromEvent(event, reservationPointerDrag.pointerId);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== reservationPointerDrag.pointerId) return;
      pointerMoveScheduler.flush();

      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      const hoveredTable = point ? getVisibleTableAtPointRef.current(point.x, point.y) : null;

      if (hoveredTable) {
        assignReservationToTableRef.current(reservationPointerDrag.reservationId, hoveredTable.id);
      }

      clearReservationPointerDrag();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== reservationPointerDrag.pointerId) return;
      pointerMoveScheduler.cancel();
      clearReservationPointerDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      pointerMoveScheduler.cancel();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [reservationPointerDrag]);

  useEffect(() => {
    if (selectedReservationId && !reservationsById.has(selectedReservationId)) {
      setSelectedReservationId(null);
    }
  }, [reservationsById, selectedReservationId]);

  useEffect(() => {
    if (selectedTableId && !tableMap.has(selectedTableId)) {
      setSelectedTableId(null);
    }
  }, [selectedTableId, tableMap]);

  useEffect(() => {
    if (selectedTableId || selectedReservationId) {
      setToolPanelTab("inspector");
    }
  }, [selectedReservationId, selectedTableId]);

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    lastAutoSavedLayoutSignatureRef.current = null;
    scheduledAutoSaveLayoutSignatureRef.current = null;
  }, [editMode, referenceDate, selectedBranchId]);

  const createDefaultBranchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Aucun restaurant sélectionné.");

      const branchCount = branches.length + 1;
      const address = typeof restaurantDetails?.address === "string" && restaurantDetails.address.trim()
        ? restaurantDetails.address.trim()
        : "Adresse à compléter";
      const city = typeof restaurantDetails?.city === "string" && restaurantDetails.city.trim()
        ? restaurantDetails.city.trim()
        : "Ville à compléter";
      const postalCode = typeof restaurantDetails?.postal_code === "string" && restaurantDetails.postal_code.trim()
        ? restaurantDetails.postal_code.trim()
        : "0000";
      const country = typeof restaurantDetails?.country === "string" && restaurantDetails.country.trim()
        ? restaurantDetails.country.trim()
        : DEFAULT_COUNTRY;
      const branchName = branchCount === 1 ? "Salle principale" : `Salle ${branchCount}`;

      const { data, error } = await (supabase.from("restaurant_branches" as any))
        .insert({
          restaurant_id: selectedId,
          name: branchName,
          address,
          city,
          postal_code: postalCode,
          country,
          is_active: true,
        })
        .select("*")
        .single();

      if (error) throw error;
      return data as unknown as BranchRow;
    },
    onSuccess: (branch) => {
      setSelectedBranchId(branch.id);
      queryClient.invalidateQueries({ queryKey: ["floor-plan-branches", selectedId] });
      toast({
        title: "Plan de salle initialise",
        description: "La première salle est prête. Vous pouvez maintenant ajouter des tables.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const saveFloorPlanVariantMutation = useMutation({
    mutationFn: async (input?: {
      name?: string;
      source?: FloorPlanVariantRow["source"];
      tables?: DraftTable[];
    }) => {
      if (!selectedId || !selectedBranchId) {
        throw new Error("Sélectionnez d'abord une salle.");
      }

      const tables = input?.tables ?? draftTables;
      const snapshot = buildFloorPlanVariantSnapshot(tables, canvasWidth, canvasHeight);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Session invalide.");

      const nowLabel = new Date().toLocaleString("fr-CH", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const defaultName = input?.source === "ai-image"
        ? `Plan IA image - ${nowLabel}`
        : `Plan enregistré - ${nowLabel}`;

      const { data, error } = await (supabase.from("floor_plan_variants" as any))
        .insert({
          restaurant_id: selectedId,
          branch_id: selectedBranchId,
          name: input?.name?.trim() || defaultName,
          source: input?.source || "manual",
          snapshot,
          created_by: user.id,
        })
        .select("*")
        .single();

      if (error) throw error;
      return data as unknown as FloorPlanVariantRow;
    },
    onSuccess: (variant) => {
      setActiveVariantId(variant.id);
      queryClient.invalidateQueries({ queryKey: ["floor-plan-variants", selectedBranchId] });
      toast({
        title: "Plan enregistré",
        description: `${variant.name} est disponible dans les plans sauvegardés.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur variante", description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (options?: SaveMutationOptions) => {
      void options;
      if (!selectedBranchId) throw new Error("Sélectionnez d'abord une salle.");

      const persistAssignments = async (tempIdToPersistedId: Map<string, string>) => {
        const normalizedAssignments = Object.fromEntries(
          Object.entries(draftAssignments).map(([reservationId, tableId]) => [
            reservationId,
            tableId ? tempIdToPersistedId.get(tableId) || tableId : null,
          ]),
        ) as Record<string, string | null>;
        const persistedAssignments = Object.fromEntries(
          reservationSlots.map((slot) => [slot.reservation_id, slot.table_id]),
        ) as Record<string, string | null>;
        const changedReservationIds = Array.from(
          new Set([...Object.keys(normalizedAssignments), ...Object.keys(persistedAssignments)]),
        ).filter((reservationId) => (
          (normalizedAssignments[reservationId] || null) !== (persistedAssignments[reservationId] || null)
        ));

        if (changedReservationIds.length > 0) {
          const changedAssignments = Object.fromEntries(
            changedReservationIds.map((reservationId) => [
              reservationId,
              normalizedAssignments[reservationId] || null,
            ]),
          ) as Record<string, string | null>;

          const { error } = await (supabase.rpc as any)("restaurant_save_floor_plan_assignments", {
            p_branch_id: selectedBranchId,
            p_assignments: changedAssignments,
            p_reason: isTemplateMode ? "Sauvegarde template plan de salle" : "Sauvegarde plan de salle du jour",
          });
          if (error) throw error;
        }

        return normalizedAssignments;
      };

      if (isTemplateMode) {
        const tempIdToPersistedId = new Map<string, string>();

        for (const table of draftTables) {
          const payload = {
            branch_id: selectedBranchId,
            table_number: table.table_number.trim() || `${getFloorPlanItemBaseName(table.layout.kind)} ${draftTables.length + 1}`,
            capacity: getPersistableCapacity(table),
            is_active: table.is_active,
            sector: table.sector.trim() || DEFAULT_SECTOR,
            layout: layoutToRecord(table.layout),
          };

          if (table.persisted) {
            const { error } = await (supabase.from("reservation_tables" as any))
              .update(payload)
              .eq("id", table.id);
            if (error) throw error;
            tempIdToPersistedId.set(table.id, table.id);
          } else {
            const { data, error } = await (supabase.from("reservation_tables" as any))
              .insert(payload)
              .select("id")
              .single();
            if (error) throw error;
            tempIdToPersistedId.set(table.id, String((data as unknown as { id: string }).id));
          }
        }

        const nextPersistedIds = draftTables.filter((table) => table.persisted).map((table) => table.id);
        const removedIds = persistedTables
          .map((table) => table.id)
          .filter((tableId) => !nextPersistedIds.includes(tableId));

        // Clear or move every reservation assignment before deleting a table.
        // This ordering keeps the operation valid even when reservation_slots
        // enforces a foreign key to reservation_tables.
        const normalizedAssignments = await persistAssignments(tempIdToPersistedId);

        if (removedIds.length > 0) {
          const { error } = await (supabase.from("reservation_tables" as any))
            .delete()
            .in("id", removedIds);
          if (error) throw error;
        }

        return normalizedAssignments;
      }

      if (hasUnpersistedDraftTables) {
        throw new Error("Sauvegardez d'abord le template avant de modifier un plan de jour.");
      }

      const templateLayoutsByTableId = new Map(
        persistedTables.map((table, index) => [
          table.id,
          buildTemplateLayout(table.layout, index, Number.isFinite(Number(table.capacity)) ? Number(table.capacity) : 2),
        ]),
      );
      const overridesToUpsert = draftTables.flatMap((table) => {
        const templateLayout = templateLayoutsByTableId.get(table.id);
        if (!templateLayout || areLayoutsEquivalent(table.layout, templateLayout)) {
          return [];
        }

        return [{
          reservation_table_id: table.id,
          branch_id: selectedBranchId,
          service_date: referenceDate,
          layout: layoutToRecord(table.layout),
          updated_at: new Date().toISOString(),
        }];
      });
      const overrideIdsToDelete = draftTables.flatMap((table) => {
        const templateLayout = templateLayoutsByTableId.get(table.id);
        const existingOverride = layoutOverridesByTableId.get(table.id);
        if (!templateLayout || !existingOverride) return [];
        return areLayoutsEquivalent(table.layout, templateLayout) ? [existingOverride.id] : [];
      });

      if (overrideIdsToDelete.length > 0) {
        const { error } = await (supabase.from("reservation_table_layout_overrides" as any))
          .delete()
          .in("id", overrideIdsToDelete);
        if (error) throw error;
      }

      if (overridesToUpsert.length > 0) {
        const { error } = await (supabase.from("reservation_table_layout_overrides" as any))
          .upsert(overridesToUpsert, { onConflict: "reservation_table_id,service_date" });
        if (error) throw error;
      }

      return persistAssignments(new Map(draftTables.map((table) => [table.id, table.id])));
    },
    onSuccess: (_data, options) => {
      queryClient.invalidateQueries({ queryKey: ["floor-plan-tables", selectedBranchId] });
      queryClient.invalidateQueries({ queryKey: ["floor-plan-layout-overrides", selectedBranchId, referenceDate] });
      queryClient.invalidateQueries({ queryKey: ["floor-plan-slots", selectedBranchId] });
      queryClient.invalidateQueries({ queryKey: ["floor-plan-reservations", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] });
      if (!isTemplateMode && options?.layoutSignature) {
        lastAutoSavedLayoutSignatureRef.current = options.layoutSignature;
        scheduledAutoSaveLayoutSignatureRef.current = null;
      }
      if (!options?.silent) {
        toast({
          title: isTemplateMode ? "Template sauvegarde" : "Plan du jour sauvegarde",
          description: isTemplateMode
            ? "Le plan par défaut a été mis à jour pour les prochains jours."
            : `Les déplacements du ${formatDashboardDateHeading(referenceDate)} ont été enregistrés.`,
        });
      }
    },
    onError: (error: Error, options) => {
      if (options?.source === "auto-layout") {
        scheduledAutoSaveLayoutSignatureRef.current = null;
        lastAutoSavedLayoutSignatureRef.current = null;
      }
      toast({
        title: options?.source === "auto-layout" ? "Erreur de sauvegarde auto" : "Erreur de sauvegarde",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const loadFloorPlanVariant = (variantId: string) => {
    if (!selectedBranchId) return;
    if (variantId === "current") {
      const nextTables: DraftTable[] = persistedTables.map((table, index) => {
        const rawCapacity = Number(table.capacity);
        const fallbackCapacity = Number.isFinite(rawCapacity) ? rawCapacity : 2;
        const layout = buildTemplateLayout(table.layout, index, fallbackCapacity);
        return {
          id: table.id,
          persisted: true,
          branch_id: table.branch_id,
          table_number: table.table_number,
          capacity: isReservableFloorPlanItem(layout.kind) ? Math.max(1, Math.round(fallbackCapacity || 2)) : 0,
          is_active: table.is_active ?? true,
          sector: table.sector?.trim() || DEFAULT_SECTOR,
          layout,
        };
      });
      setActiveVariantId(null);
      setExtraSectors([]);
      commitHistorySnapshot(buildHistorySnapshot(nextTables, draftAssignments, null));
      return;
    }

    const variant = floorPlanVariants.find((item) => item.id === variantId);
    if (!variant) return;

    const nextTables = buildDraftTablesFromVariant(variant, selectedBranchId);
    if (nextTables.length === 0) {
      toast({
        title: "Plan vide",
        description: "Cette variante ne contient aucun élément exploitable.",
        variant: "destructive",
      });
      return;
    }

    const nextSectors = Array.from(new Set(nextTables.map((table) => table.sector).filter(Boolean)));
    setEditMode("template");
    setActiveVariantId(variant.id);
    setExtraSectors(nextSectors.filter((sector) => sector !== DEFAULT_SECTOR));
    setSelectedSector(nextSectors[0] || DEFAULT_SECTOR);
    commitHistorySnapshot(buildHistorySnapshot(nextTables, {}, null));
    toast({
      title: "Plan chargé",
      description: "Vous pouvez l'ajuster puis l'enregistrer comme template actif.",
    });
  };

  const updateReservationStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const result = await updateRestaurantReservationStatus(id, status);
      if (!result.ok) {
        throw new Error(result.errorMessage);
      }

      return { id, status };
    },
    onMutate: async ({ id, status }) => {
      const queryKey = ["floor-plan-reservations", selectedId];
      await queryClient.cancelQueries({ queryKey });
      const previousReservations = queryClient.getQueryData<ReservationWithCustomer[]>(queryKey) || [];

      queryClient.setQueryData<ReservationWithCustomer[]>(queryKey, (current = []) => (
        current.map((reservation) => (
          reservation.id === id
            ? { ...reservation, status, updated_at: new Date().toISOString() }
            : reservation
        ))
      ));

      return { previousReservations, queryKey };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousReservations);
      }

      toast({
        title: "Statut non modifie",
        description: error.message,
        variant: "destructive",
      });
    },
    onSuccess: ({ status }) => {
      toast({
        title: "Statut mis à jour",
        description: `Reservation ${getReservationStatusLabel(status)}.`,
      });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] });
    },
  });

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    if (isTemplateMode || !selectedBranchId || hasUnpersistedDraftTables || !serviceDirty) {
      return undefined;
    }

    if (dragState || resizeState || rotateState || saveMutation.isPending) {
      return undefined;
    }

    if (
      lastAutoSavedLayoutSignatureRef.current === servicePersistenceSignature
      || scheduledAutoSaveLayoutSignatureRef.current === servicePersistenceSignature
    ) {
      return undefined;
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      scheduledAutoSaveLayoutSignatureRef.current = servicePersistenceSignature;
      saveMutation.mutate({
        silent: true,
        source: "auto-layout",
        layoutSignature: servicePersistenceSignature,
      });
    }, 900);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [
    dragState,
    hasUnpersistedDraftTables,
    isTemplateMode,
    referenceDate,
    resizeState,
    rotateState,
    saveMutation,
    selectedBranchId,
    serviceDirty,
    servicePersistenceSignature,
  ]);

  const addSector = () => {
    if (!isTemplateMode) {
      toast({
        title: "Mode template requis",
        description: "Ajoutez ou modifiez les secteurs depuis le template global.",
        variant: "destructive",
      });
      return;
    }
    const normalized = newSectorName.trim();
    if (!normalized) return;
    if (!sectorOptions.includes(normalized)) {
      setExtraSectors((current) => [...current, normalized]);
    }
    setSelectedSector(normalized);
    setNewSectorName("");
  };

  const updateDraftTable = (tableId: string, updater: (table: DraftTable) => DraftTable) => {
    const nextTables = draftTables.map((table) => (table.id === tableId ? updater(table) : table));
    commitHistorySnapshot(buildHistorySnapshot(nextTables, draftAssignments, selectedTableId));
  };

  const updateDraftTableFootprint = (tableId: string, width: number, height: number) => {
    updateDraftTable(tableId, (table) => ({
      ...table,
      layout: clampFloorPlanLayout(
        ensureFloorPlanLayoutFitsCapacity(
          {
            ...table.layout,
            w: Math.round(width),
            h: Math.round(height),
          },
          table.capacity,
          table.layout.shape,
          table.layout.kind,
        ),
        canvasWidth,
        canvasHeight,
      ),
    }));
  };

  const nudgeDraftTable = (tableId: string, deltaX: number, deltaY: number) => {
    if (!isTemplateMode) return;
    updateDraftTable(tableId, (table) => ({
      ...table,
      layout: clampFloorPlanLayout({
        ...table.layout,
        x: table.layout.x + deltaX,
        y: table.layout.y + deltaY,
      }, canvasWidth, canvasHeight),
    }));
  };

  const removeDraftTable = (tableId: string) => {
    if (!isTemplateMode) {
      toast({
        title: "Mode template requis",
        description: "Supprimez un element depuis le template global.",
        variant: "destructive",
      });
      return;
    }
    const nextTables = draftTables.filter((table) => table.id !== tableId);
    const nextAssignments = Object.fromEntries(
      Object.entries(draftAssignments).map(([reservationId, assignedTableId]) => [
        reservationId,
        assignedTableId === tableId ? null : assignedTableId,
      ]),
    ) as Record<string, string | null>;
    commitHistorySnapshot(buildHistorySnapshot(
      nextTables,
      nextAssignments,
      selectedTableId === tableId ? null : selectedTableId,
    ));
  };

  const addTableFromPreset = (presetId: string) => {
    if (!selectedBranchId) {
      toast({ title: "Sélection requise", description: "Sélectionnez d'abord une salle.", variant: "destructive" });
      return;
    }
    if (!isTemplateMode) {
      toast({
        title: "Mode template requis",
        description: "Ajoutez une table ou un meuble dans le template pour qu'il apparaisse tous les jours.",
        variant: "destructive",
      });
      return;
    }

    const preset = FLOOR_PLAN_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    if (preset.category === "table") {
      setPendingPresetId(presetId);
      setTableConfigDialogOpen(true);
      return;
    }

    const tableId = `draft-${crypto.randomUUID()}`;
    const nextTables = [
      ...draftTables,
      {
        id: tableId,
        persisted: false,
        branch_id: selectedBranchId,
        table_number: getNextPresetLabel(draftTables, preset),
        capacity: preset.capacity,
        is_active: true,
        sector: selectedSector,
        layout: buildDraftFloorPlanLayout(draftTables.length, preset),
      },
    ];
    commitHistorySnapshot(buildHistorySnapshot(nextTables, draftAssignments, tableId));
  };

  const confirmTableConfig = (config: TableConfig) => {
    if (editingSeatingTableId) {
      const nextTables = draftTables.map((table) => table.id !== editingSeatingTableId ? table : ({
        ...table,
        capacity: config.capacity,
        layout: ensureFloorPlanLayoutFitsCapacity(
          {
            ...table.layout,
            shape: config.shape,
            seatType: config.seatType,
            seatPlacements: config.seatPlacements,
            cornerBenchConfigs: config.cornerBenchConfigs,
            tableWidth: config.tableWidth,
            tableHeight: config.tableHeight,
          },
          config.capacity,
          config.shape,
          table.layout.kind,
        ),
      }));
      commitHistorySnapshot(buildHistorySnapshot(nextTables, draftAssignments, editingSeatingTableId));
      setEditingSeatingTableId(null);
    } else if (pendingPresetId) {
      const preset = FLOOR_PLAN_PRESETS.find((item) => item.id === pendingPresetId);
      if (preset && selectedBranchId) {
        const tableId = `draft-${crypto.randomUUID()}`;
        const nextTables = [
          ...draftTables,
          {
            id: tableId,
            persisted: false,
            branch_id: selectedBranchId,
            table_number: getNextPresetLabel(draftTables, { ...preset, capacity: config.capacity, shape: config.shape }),
            capacity: config.capacity,
            is_active: true,
            sector: selectedSector,
            layout: ensureFloorPlanLayoutFitsCapacity(
              {
                ...buildDraftFloorPlanLayout(draftTables.length, { ...preset, capacity: config.capacity, shape: config.shape }),
                seatType: config.seatType,
                seatPlacements: config.seatPlacements,
                cornerBenchConfigs: config.cornerBenchConfigs,
                tableWidth: config.tableWidth,
                tableHeight: config.tableHeight,
              },
              config.capacity,
              config.shape,
              preset.kind,
            ),
          },
        ];
        commitHistorySnapshot(buildHistorySnapshot(nextTables, draftAssignments, tableId));
      }
      setPendingPresetId(null);
    }
    setTableConfigDialogOpen(false);
  };

  const duplicateTable = (sourceTableId: string) => {
    const source = draftTables.find((t) => t.id === sourceTableId);
    if (!source || !isTemplateMode) return;

    const tableId = `draft-${crypto.randomUUID()}`;
    const nextTables = [
      ...draftTables,
      {
        ...source,
        id: tableId,
        persisted: false,
        table_number: getNextPresetLabel(draftTables, {
          id: "",
          label: "",
          description: "",
          category: isReservableFloorPlanItem(source.layout.kind) ? "table" : "furniture",
          kind: source.layout.kind,
          capacity: source.capacity,
          shape: source.layout.shape,
          w: source.layout.w,
          h: source.layout.h,
        }),
        layout: clampFloorPlanLayout({
          ...source.layout,
          x: source.layout.x + 24,
          y: source.layout.y + 24,
        }, canvasWidth, canvasHeight),
      },
    ];
    commitHistorySnapshot(buildHistorySnapshot(nextTables, draftAssignments, tableId));
  };

  const applyAILayout = (result: AIFloorPlanResult) => {
    if (!selectedBranchId || !isTemplateMode) {
      toast({
        title: "Mode template requis",
        description: "Passez en mode template pour appliquer une disposition IA.",
        variant: "destructive",
      });
      return;
    }

    const AI_KIND_MAP: Record<string, { kind: FloorPlanItemKind; category: "table" | "furniture" }> = {
      "table-round-2": { kind: "table", category: "table" },
      "table-round-4": { kind: "table", category: "table" },
      "table-rect-2": { kind: "table", category: "table" },
      "table-rect-4": { kind: "table", category: "table" },
      "table-rect-6": { kind: "table", category: "table" },
      table: { kind: "table", category: "table" },
      chair: { kind: "chair", category: "furniture" },
      stool: { kind: "stool", category: "furniture" },
      bar: { kind: "bar", category: "furniture" },
      "corner-bench": { kind: "corner-bench", category: "furniture" },
      banquette: { kind: "banquette", category: "furniture" },
      booth: { kind: "booth", category: "furniture" },
      "host-stand": { kind: "host-stand", category: "furniture" },
      divider: { kind: "divider", category: "furniture" },
      plant: { kind: "plant", category: "furniture" },
      "service-station": { kind: "service-station", category: "furniture" },
    };

    const newTables: DraftTable[] = result.tables.map((aiTable) => {
      const mapped = AI_KIND_MAP[aiTable.kind] || { kind: "table" as FloorPlanItemKind, category: "table" as const };
      const isTable = mapped.category === "table";
      const shape = aiTable.shape === "round" ? "round" : "rect" as FloorPlanTableShape;
      const capacity = isTable ? Math.max(1, aiTable.capacity || 2) : 0;
      const seatLabels = isTable
        ? (aiTable.seatLabels?.length ? aiTable.seatLabels : Array.from({ length: capacity }, (_, i) => i + 1))
        : [];
      const seatType = aiTable.seatType && ["chair", "stool", "bench", "corner-bench"].includes(aiTable.seatType)
        ? aiTable.seatType as FloorPlanSeatType
        : undefined;
      const seatPlacements = isTable && Array.isArray(aiTable.seatPlacements)
        ? aiTable.seatPlacements.flatMap((placement) => (
          placement && typeof placement.zone === "string" && typeof placement.type === "string" && Number(placement.count) > 0
            ? [{
              zone: placement.zone,
              type: placement.type,
              count: Math.round(Number(placement.count)),
              benchLength: Number.isFinite(Number(placement.benchLength)) ? Number(placement.benchLength) : undefined,
              benchDepth: Number.isFinite(Number(placement.benchDepth)) ? Number(placement.benchDepth) : undefined,
            } as FloorPlanSeatPlacement]
            : []
        ))
        : undefined;

      const layout = clampFloorPlanLayout(
        ensureFloorPlanLayoutFitsCapacity(
          {
            x: aiTable.x || 24,
            y: aiTable.y || 24,
            w: Math.max(60, aiTable.w || 140),
            h: Math.max(60, aiTable.h || 100),
            rotation: aiTable.rotation || 0,
            shape,
            kind: mapped.kind,
            seatLabels,
            seatType,
            seatPlacements,
          },
          capacity,
          shape,
          mapped.kind,
        ),
        canvasWidth,
        canvasHeight,
      );

      return {
        id: `draft-${crypto.randomUUID()}`,
        persisted: false,
        branch_id: selectedBranchId,
        table_number: aiTable.table_number || `AI-${Math.random().toString(36).slice(2, 5)}`,
        capacity,
        is_active: true,
        sector: selectedSector,
        layout,
      };
    });

    commitHistorySnapshot(buildHistorySnapshot(newTables, {}, null));
    saveFloorPlanVariantMutation.mutate({
      name: result.variantName,
      source: result.source === "image-import" ? "ai-image" : "ai-generated",
      tables: newTables,
    });
    toast({
      title: "Disposition IA appliquée",
      description: `${newTables.length} éléments placés, ${newTables.reduce((s, t) => s + t.capacity, 0)} couverts au total.`,
    });
  };

  const startDraggingTable = (event: React.PointerEvent<HTMLElement>, tableId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setResizeState(null);
    setRotateState(null);

    const table = tableMap.get(tableId);
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!table || !point) return;
    const renderedFrame = getRenderedDraftTableFrame(table);

    setDragState({
      tableId,
      pointerId: event.pointerId,
      offsetX: point.x - renderedFrame.x,
      offsetY: point.y - renderedFrame.y,
    });
    setSelectedTableId(tableId);
  };

  const startRotatingTable = (event: React.PointerEvent<HTMLElement>, tableId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState(null);
    setResizeState(null);

    const table = tableMap.get(tableId);
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!table || !point) return;
    const frame = getRenderedDraftTableFrame(table);
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const startAngle = Math.atan2(point.y - cy, point.x - cx) * (180 / Math.PI);

    setRotateState({
      tableId,
      pointerId: event.pointerId,
      startAngle,
      startRotation: table.layout.rotation,
    });
    setSelectedTableId(tableId);
  };

  const startResizingTable = (
    event: React.PointerEvent<HTMLButtonElement>,
    tableId: string,
    handle: ResizeHandle,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState(null);
    setRotateState(null);

    const table = tableMap.get(tableId);
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    const renderedFrame = table ? getRenderedDraftTableFrame(table) : null;
    if (!table || !point || !renderedFrame) return;

    setResizeState({
      tableId,
      pointerId: event.pointerId,
      handle,
      startX: point.x,
      startY: point.y,
      startLayout: table.layout,
      startFrame: renderedFrame,
    });
    setSelectedTableId(tableId);
  };

  function getTableAssignmentLoad(tableId: string, assignments: Record<string, string | null>) {
    return branchScopedReservations.filter((candidate) => {
      if (RELEASED_STATUSES.has(String(candidate.status || "").toLowerCase())) return false;
      return assignments[candidate.id] === tableId;
    }).length;
  }

  function getTableAssignedReservations(tableId: string, assignments: Record<string, string | null>) {
    return branchScopedReservations.filter((candidate) => {
      if (RELEASED_STATUSES.has(String(candidate.status || "").toLowerCase())) return false;
      return assignments[candidate.id] === tableId;
    });
  }

  function getReservationDropStateForAssignments(
    reservationId: string,
    tableId: string,
    assignments: Record<string, string | null>,
  ) {
    const reservation = reservationsById.get(reservationId);
    const table = tableMap.get(tableId);

    if (!reservation || !table) {
      return { ok: false, reason: "Reservation ou table introuvable." };
    }

    if (!isReservableDraftTable(table)) {
      return {
        ok: false,
        reason: `${table.table_number} est un meuble decoratif. Choisissez une vraie table.`,
      };
    }

    if (reservation.party_size > table.capacity) {
      return {
        ok: false,
        reason: `${table.table_number} ne peut pas accueillir ${reservation.party_size} personnes.`,
      };
    }

    const targetSchedule = buildSchedule(reservation);
    const conflictingReservation = branchScopedReservations.find((candidate) => {
      if (candidate.id === reservationId) return false;
      if (RELEASED_STATUSES.has(String(candidate.status || "").toLowerCase())) return false;
      if (assignments[candidate.id] !== tableId) return false;
      return reservationsOverlap(targetSchedule, buildSchedule(candidate));
    });

    if (conflictingReservation) {
      return {
        ok: false,
        reason: `${table.table_number} est déjà pris autour de ${getSafeTime(conflictingReservation.time)}.`,
      };
    }

    return { ok: true as const, reason: null };
  }

  function getReservationDropState(reservationId: string, tableId: string) {
    return getReservationDropStateForAssignments(reservationId, tableId, draftAssignments);
  }

  const autoPlaceVisibleReservations = () => {
    if (isTemplateMode) {
      toast({
        title: "Plan du jour requis",
        description: "Le placement automatique s'applique au service, pas au template.",
        variant: "destructive",
      });
      return;
    }

    const nextAssignments = { ...draftAssignments };
    const reservationsToPlace = unassignedVisibleReservations
      .slice()
      .sort((left, right) => (
        Number(right.party_size || 0) - Number(left.party_size || 0)
        || getSafeTime(left.time).localeCompare(getSafeTime(right.time), "fr")
      ));
    const placed: Array<{ reservation: ReservationWithCustomer; table: DraftTable; score: number }> = [];

    reservationsToPlace.forEach((reservation) => {
      const bestSuggestion = visibleReservableTables
        .filter((table) => getReservationDropStateForAssignments(reservation.id, table.id, nextAssignments).ok)
        .map((table) => ({
          table,
          placement: scoreReservationPlacement({
            reservation,
            table,
            currentTableLoad: getTableAssignmentLoad(table.id, nextAssignments),
            currentTableReservations: getTableAssignedReservations(table.id, nextAssignments),
          }),
        }))
        .sort((left, right) => {
          return right.placement.score - left.placement.score
            || left.table.capacity - right.table.capacity
            || left.table.table_number.localeCompare(right.table.table_number, "fr");
        })[0] || null;

      if (!bestSuggestion) return;
      nextAssignments[reservation.id] = bestSuggestion.table.id;
      placed.push({
        reservation,
        table: bestSuggestion.table,
        score: bestSuggestion.placement.score,
      });
    });

    if (placed.length === 0) {
      toast({
        title: "Aucun placement possible",
        description: "Aucune réservation visible ne trouve une table compatible sans conflit.",
      });
      return;
    }

    const lastPlaced = placed[placed.length - 1];
    commitHistorySnapshot(buildHistorySnapshot(draftTables, nextAssignments, lastPlaced?.table.id || selectedTableId));
    setSelectedReservationId(lastPlaced?.reservation.id || null);
    toast({
      title: "Placement automatique applique",
      description: `${placed.length} réservation(s) placée(s). Dernier score: ${lastPlaced.score}/100.`,
    });
  };

  const assignReservationToTable = (reservationId: string, tableId: string) => {
    const dropState = getReservationDropState(reservationId, tableId);
    if (!dropState.ok) {
      toast({
        title: dropState.reason?.includes("accueillir") ? "Table trop petite" : "Conflit de placement",
        description: dropState.reason,
        variant: "destructive",
      });
      return;
    }

    const nextAssignments = {
      ...draftAssignments,
      [reservationId]: tableId,
    };
    commitHistorySnapshot(buildHistorySnapshot(draftTables, nextAssignments, tableId));
    setSelectedReservationId(reservationId);
  };

  const clearReservationAssignment = (reservationId: string) => {
    const nextAssignments = { ...draftAssignments, [reservationId]: null };
    commitHistorySnapshot(buildHistorySnapshot(draftTables, nextAssignments, selectedTableId));
    setSelectedReservationId(reservationId);
  };

  const clearServiceSelection = () => {
    setSelectedReservationId(null);
    setSelectedTableId(null);
    setDraggedReservationId(null);
    setDragOverTableId(null);
    setReservationPointerDrag(null);
    setReservationPointerPosition(null);
  };

  const handleServiceReservationPress = (reservationId: string) => {
    if (selectedTableId) {
      const targetTable = tableMap.get(selectedTableId);
      if (targetTable && isReservableDraftTable(targetTable)) {
        const dropState = getReservationDropState(reservationId, selectedTableId);
        if (dropState.ok) {
          assignReservationToTable(reservationId, selectedTableId);
          return;
        }
      }
    }

    setSelectedReservationId(reservationId);
    const assignedTableId = draftAssignments[reservationId];
    if (assignedTableId) {
      setSelectedTableId(assignedTableId);
    }
  };

  const handleServiceTablePress = (tableId: string) => {
    const targetTable = tableMap.get(tableId);
    if (selectedReservationId && targetTable && isReservableDraftTable(targetTable)) {
      const dropState = getReservationDropState(selectedReservationId, tableId);
      if (dropState.ok) {
        assignReservationToTable(selectedReservationId, tableId);
        return;
      }
    }

    setSelectedTableId(tableId);
    if (!selectedReservationId) {
      const primaryAssignment = (visibleAssignmentsByTable.get(tableId) || [])[0];
      if (primaryAssignment) {
        setSelectedReservationId(primaryAssignment.id);
      }
    }
  };

  const handleReservationDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    reservationId: string,
  ) => {
    setDraggedReservationId(reservationId);
    setSelectedTableId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-reservation-id", reservationId);
    event.dataTransfer.setData("text/plain", reservationId);
  };

  const handleReservationDragEnd = () => {
    setDraggedReservationId(null);
    setDragOverTableId(null);
    setReservationPointerDrag(null);
    setReservationPointerPosition(null);
  };

  const handleReservationHandlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    reservationId: string,
  ) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedReservationId(null);
    setSelectedTableId(null);
    setDraggedReservationId(reservationId);
    setReservationPointerDrag({
      reservationId,
      pointerId: event.pointerId,
    });
    setReservationPointerPosition({
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const updateCanvasZoom = (nextZoom: number) => {
    setCanvasZoom(clampCanvasZoom(nextZoom));
  };

  const revealResponsivePanel = (panelId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(panelId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    updateCanvasZoom(effectiveCanvasZoom + (event.deltaY < 0 ? CANVAS_ZOOM_STEP : -CANVAS_ZOOM_STEP));
  };

  const handleCanvasDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const reservationId = draggedReservationId
      || event.dataTransfer.getData("application/x-reservation-id")
      || event.dataTransfer.getData("text/plain");

    if (!reservationId) {
      setDragOverTableId(null);
      return;
    }

    event.preventDefault();
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!point) return;

    const hoveredTable = getVisibleTableAtPoint(point.x, point.y);
    setDragOverTableId(hoveredTable?.id || null);
    const dropState = hoveredTable ? getReservationDropState(reservationId, hoveredTable.id) : null;
    event.dataTransfer.dropEffect = dropState?.ok ? "move" : "none";
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const reservationId = draggedReservationId
      || event.dataTransfer.getData("application/x-reservation-id")
      || event.dataTransfer.getData("text/plain");

    event.preventDefault();
    if (!reservationId) {
      setDraggedReservationId(null);
      setDragOverTableId(null);
      return;
    }

    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    const hoveredTable = point ? getVisibleTableAtPoint(point.x, point.y) : null;

    if (hoveredTable) {
      assignReservationToTable(reservationId, hoveredTable.id);
    }

    setDraggedReservationId(null);
    setDragOverTableId(null);
  };

  const handleCanvasDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
      setDragOverTableId(null);
    }
  };

  useEffect(() => {
    assignReservationToTableRef.current = assignReservationToTable;
    getVisibleTableAtPointRef.current = getVisibleTableAtPoint;
  });

  const selectedReservationAssignedTableId = selectedReservation ? draftAssignments[selectedReservation.id] : null;
  const selectedReservationAssignedTable = selectedReservationAssignedTableId
    ? tableMap.get(selectedReservationAssignedTableId) || null
    : null;
  const floorPlanHealth = useMemo(() => getFloorPlanHealthSummary({
    tables: draftTables.map((table) => ({
      id: table.id,
      tableNumber: table.table_number,
      capacity: table.capacity,
      isActive: table.is_active,
      kind: table.layout.kind,
    })),
    reservations: filteredReservations.map((reservation) => ({
      id: reservation.id,
      partySize: Number(reservation.party_size || 0),
      assignedTableId: draftAssignments[reservation.id],
      date: reservation.date,
      time: reservation.time,
    })),
  }), [draftAssignments, draftTables, filteredReservations]);
  const floorPlanHealthTone = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-rose-200 bg-rose-50 text-rose-800",
  }[floorPlanHealth.status];
  const selectedReservationService = selectedReservation ? getReservationService(selectedReservation) : null;
  const saveStatus = (() => {
    if (saveMutation.isPending) {
      return {
        label: "Sauvegarde en cours",
        detail: "Les derniers ajustements sont en train d'être synchronisés.",
        tone: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    if (isTemplateMode) {
      return hasUnpersistedDraftTables
        ? {
            label: "Template à enregistrer",
            detail: "De nouveaux éléments doivent être sauvegardés avant diffusion.",
            tone: "border-amber-200 bg-amber-50 text-amber-800",
          }
        : {
            label: "Template synchronise",
            detail: "La structure de salle est à jour.",
            tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
          };
    }

    return serviceDirty
      ? {
          label: "Plan du jour modifie",
          detail: serviceAssignmentsDirty
            ? "Les derniers placements seront sauvegardés automatiquement."
            : "Les derniers déplacements seront sauvegardés automatiquement.",
          tone: "border-sky-200 bg-sky-50 text-sky-800",
        }
      : {
          label: "Plan du jour synchronise",
          detail: "Les placements affichés correspondent à la version en base.",
          tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
        };
  })();

  return (
    <DashboardLayout contentWidth="full" mainClassName="p-2 pb-24 sm:p-3 md:p-4">
      <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-3 xl:h-[calc(100vh-2rem)] xl:min-h-0 xl:overflow-hidden">
        <header className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Plan de salle</h1>
                <span aria-live="polite" className={cn("hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex", saveStatus.tone)}>
                  {saveStatus.label}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">
                {selectedRestaurant?.name || "Sélectionnez un restaurant"}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={editMode === "service" ? "default" : "ghost"}
                  className="h-9 rounded-lg px-3"
                  onClick={() => setEditMode("service")}
                >
                  Service
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editMode === "template" ? "default" : "ghost"}
                  className="h-9 rounded-lg px-3"
                  onClick={() => setEditMode("template")}
                >
                  Configurer
                </Button>
              </div>

              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  onClick={undoFloorPlan}
                  disabled={!canUndoFloorPlan || saveMutation.isPending}
                  aria-label="Annuler"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  onClick={redoFloorPlan}
                  disabled={!canRedoFloorPlan || saveMutation.isPending}
                  aria-label="Rétablir"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </div>

              {isTemplateMode ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 rounded-xl"
                    onClick={() => saveFloorPlanVariantMutation.mutate({ source: "manual" })}
                    disabled={!selectedBranch || saveFloorPlanVariantMutation.isPending}
                    aria-label="Sauver variante"
                    title="Sauver variante"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={() => {
                      setToolPanelTab("library");
                    revealResponsivePanel("floor-plan-studio-tools");
                  }}
                  disabled={!selectedBranch}
                >
                  <Plus className="mr-2 h-4 w-4" />
                    Ajouter
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-orange-600 px-4 text-white hover:bg-orange-700"
                  onClick={autoPlaceVisibleReservations}
                  disabled={!selectedBranch || unassignedVisibleReservations.length === 0 || saveMutation.isPending}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Placer automatiquement
                </Button>
              )}

              <Button
                type="button"
                variant={isTemplateMode ? "default" : "outline"}
                className="h-11 rounded-xl"
                onClick={() => saveMutation.mutate({
                  silent: false,
                  source: "manual",
                  layoutSignature: isTemplateMode ? null : servicePersistenceSignature,
                })}
                disabled={!canPersist || saveMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Sauvegarde…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </header>

        {restaurantsLoading ? <p className="text-sm text-slate-500">Chargement…</p> : null}
        {restaurantsError || branchesError || tablesError || floorPlanVariantsError || layoutOverridesError || reservationsError || slotsError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Une partie du plan n’a pas pu être chargée. Réessayez dans un instant.
          </div>
        ) : null}

        {!selectedId && !restaurantsLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-slate-500">
              Sélectionnez un restaurant pour ouvrir son plan de salle.
            </CardContent>
          </Card>
        ) : null}

        {selectedId && !branchesLoading && branches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Créez votre salle principale</h2>
                <p className="mt-1 text-sm text-slate-500">Vous pourrez ensuite ajouter et déplacer vos tables.</p>
              </div>
              <Button onClick={() => createDefaultBranchMutation.mutate()} disabled={createDefaultBranchMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                {createDefaultBranchMutation.isPending ? "Création…" : "Créer la salle"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {selectedBranch ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 xl:overflow-hidden">
            <div className={cn(
              "grid shrink-0 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm",
              isTemplateMode
                ? "grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(200px,1fr)]"
                : "grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_170px_150px]",
            )}>
              <Select value={selectedBranchId || ""} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white">
                  <SelectValue placeholder="Salle" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSector} onValueChange={setSelectedSector}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  {sectorOptions.map((sector) => (
                    <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isTemplateMode ? (
                <Select value={activeVariantId || "current"} onValueChange={loadFloorPlanVariant}>
                  <SelectTrigger className="col-span-2 h-11 rounded-xl border-slate-200 bg-white lg:col-span-1">
                    <SelectValue placeholder="Plan actif" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Template actif</SelectItem>
                    {floorPlanVariants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>{variant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    type="date"
                    value={referenceDate}
                    className="h-11 rounded-xl border-slate-200 bg-white"
                    onChange={(event) => setReferenceDate(event.target.value)}
                    aria-label="Date du service"
                  />
                  <Select value={serviceFilter} onValueChange={(value) => setServiceFilter(value as ServiceFilter)}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white">
                      <SelectValue placeholder="Service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toute la journée</SelectItem>
                      <SelectItem value="lunch">Midi</SelectItem>
                      <SelectItem value="dinner">Soir</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            {isTemplateMode ? (
              <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:auto-rows-[minmax(0,1fr)] xl:overflow-hidden">
                <StudioCanvas
                  selectedSector={selectedSector}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  canvasZoom={effectiveCanvasZoom}
                  canvasZoomLabel={canvasZoomLabel}
                  canvasRef={canvasRef}
                  canvasViewportRef={canvasViewportRef}
                  visibleTables={visibleTables}
                  selectedTableId={selectedTableId}
                  draggingTableId={dragState?.tableId || resizeState?.tableId || rotateState?.tableId || null}
                  onTablePress={(tableId) => {
                    setSelectedTableId(tableId);
                    setToolPanelTab("inspector");
                  }}
                  onCanvasWheel={handleCanvasWheel}
                  onCanvasBackgroundPress={() => setSelectedTableId(null)}
                  onStartDraggingTable={startDraggingTable}
                  onStartResizingTable={(event, tableId, handle) => startResizingTable(event, tableId, handle)}
                  onStartRotatingTable={startRotatingTable}
                  onUpdateCanvasZoom={updateCanvasZoom}
                  onCanvasViewportResize={syncCanvasSizeFromViewport}
                  onNudgeTable={nudgeDraftTable}
                  onDeleteTable={removeDraftTable}
                  getRenderedFrame={getRenderedDraftTableFrame}
                />

                <div id="floor-plan-studio-tools" className="min-h-[460px] scroll-mt-3 xl:min-h-0">
                  <Tabs
                    value={toolPanelTab}
                    onValueChange={(value) => setToolPanelTab(value as "library" | "inspector")}
                    className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <TabsList className="grid h-10 w-full shrink-0 grid-cols-2 rounded-xl bg-slate-100 p-1">
                      <TabsTrigger value="library" className="rounded-lg text-xs">Ajouter</TabsTrigger>
                      <TabsTrigger value="inspector" className="rounded-lg text-xs">Régler</TabsTrigger>
                    </TabsList>
                    <TabsContent value="library" className="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden">
                      <StudioPalette
                        selectedId={selectedId}
                        selectedSector={selectedSector}
                        sectorOptions={sectorOptions}
                        libraryTab={libraryTab}
                        libraryQuery={libraryQuery}
                        canvasWidth={canvasWidth}
                        canvasHeight={canvasHeight}
                        draftTables={draftTables}
                        tablesLoading={tablesLoading}
                        newSectorName={newSectorName}
                        onLibraryTabChange={setLibraryTab}
                        onLibraryQueryChange={setLibraryQuery}
                        onPresetClick={(presetId) => {
                          addTableFromPreset(presetId);
                          setToolPanelTab("inspector");
                        }}
                        onSectorSelect={setSelectedSector}
                        onNewSectorNameChange={setNewSectorName}
                        onAddSector={addSector}
                        onApplyAILayout={(layout) => {
                          applyAILayout(layout);
                          setToolPanelTab("inspector");
                        }}
                        presetsByTab={filteredLibraryPresets}
                      />
                    </TabsContent>
                    <TabsContent value="inspector" className="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden">
                      <StudioInspector
                        selectedTable={selectedTable}
                        selectedTableIsReservable={selectedTableIsReservable}
                        selectedTableDimensions={selectedTableDimensions}
                        sectorOptions={sectorOptions}
                        onRename={(value) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({ ...table, table_number: value }));
                        }}
                        onSectorChange={(value) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({ ...table, sector: value }));
                        }}
                        onRotationChange={(value) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({ ...table, layout: { ...table.layout, rotation: value } }));
                        }}
                        onRotateIncrement={() => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({
                            ...table,
                            layout: { ...table.layout, rotation: (table.layout.rotation + 45) % 360 },
                          }));
                        }}
                        onToggleActive={(checked) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({ ...table, is_active: checked }));
                        }}
                        onConfigureTable={() => {
                          if (!selectedTable) return;
                          setEditingSeatingTableId(selectedTable.id);
                          setTableConfigDialogOpen(true);
                        }}
                        onDuplicate={() => selectedTable && duplicateTable(selectedTable.id)}
                        onRemove={() => selectedTable && removeDraftTable(selectedTable.id)}
                        onUpdateFurnitureWidth={(value) => selectedTable && updateDraftTableFootprint(selectedTable.id, value, selectedTable.layout.h)}
                        onUpdateFurnitureHeight={(value) => selectedTable && updateDraftTableFootprint(selectedTable.id, selectedTable.layout.w, value)}
                        onUpdateFurnitureSize={(width, height) => selectedTable && updateDraftTableFootprint(selectedTable.id, width, height)}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px] xl:auto-rows-[minmax(0,1fr)] xl:overflow-hidden">
                <ServiceBoard
                  selectedSector={selectedSector}
                  subtitle={`${formatDashboardDateHeading(referenceDate)} · ${filteredReservations.length} réservation(s)`}
                  activeReservationLabel={activeServiceReservation ? getReservationCustomerLabel(activeServiceReservation) : null}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  canvasZoom={effectiveCanvasZoom}
                  canvasZoomLabel={canvasZoomLabel}
                  canvasRef={canvasRef}
                  canvasViewportRef={canvasViewportRef}
                  visibleTables={visibleTables}
                  visibleAssignmentsByTable={visibleAssignmentsByTable}
                  selectedTableId={selectedTableId}
                  selectedReservationId={selectedReservationId}
                  draggedReservationId={draggedReservationId}
                  dragOverTableId={dragOverTableId}
                  visibleTablesCount={visibleTables.length}
                  availableTablesCount={availableTables.length}
                  unassignedReservationsCount={unassignedVisibleReservations.length}
                  onTablePress={handleServiceTablePress}
                  onPrimaryReservationPress={(reservationId, tableId) => {
                    setSelectedReservationId(reservationId);
                    setSelectedTableId(tableId);
                  }}
                  onReservationStatusChange={(reservationId, status) => updateReservationStatusMutation.mutate({ id: reservationId, status })}
                  onReleaseReservation={clearReservationAssignment}
                  onCanvasWheel={handleCanvasWheel}
                  onCanvasDragOver={handleCanvasDragOver}
                  onCanvasDrop={handleCanvasDrop}
                  onCanvasDragLeave={handleCanvasDragLeave}
                  onCanvasBackgroundPress={clearServiceSelection}
                  onStartDraggingTable={startDraggingTable}
                  onStartResizingTable={(event, tableId, handle) => startResizingTable(event, tableId, handle)}
                  onStartRotatingTable={startRotatingTable}
                  onUpdateCanvasZoom={updateCanvasZoom}
                  onCanvasViewportResize={syncCanvasSizeFromViewport}
                  getReservationDropState={getReservationDropState}
                  getRenderedFrame={getRenderedDraftTableFrame}
                  getTableContentPadding={getTableContentPadding}
                />

                <Button
                  type="button"
                  variant="outline"
                  className="sticky bottom-3 z-30 h-12 rounded-2xl border-slate-200 bg-white shadow-xl xl:hidden"
                  onClick={() => revealResponsivePanel("floor-plan-reservation-queue")}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Clients ({unassignedVisibleReservations.length} à placer)
                </Button>

                <div id="floor-plan-reservation-queue" className="min-h-[420px] scroll-mt-3 xl:min-h-0">
                  <SimpleReservationQueue
                    reservationQuery={reservationQuery}
                    reservationsLoading={reservationsLoading}
                    selectedReservationId={selectedReservationId}
                    selectedTable={selectedTableIsReservable ? selectedTable : null}
                    draggedReservationId={draggedReservationId}
                    unassignedReservations={unassignedVisibleReservations}
                    assignedReservations={assignedVisibleReservations}
                    draftAssignments={draftAssignments}
                    tableMap={tableMap}
                    recommendedTablesByReservationId={recommendedTablesByReservationId}
                    onReservationQueryChange={setReservationQuery}
                    onReservationPress={handleServiceReservationPress}
                    onReservationDragStart={handleReservationDragStart}
                    onReservationDragEnd={handleReservationDragEnd}
                    onReservationHandlePointerDown={handleReservationHandlePointerDown}
                    onReleaseReservation={clearReservationAssignment}
                    onAssignReservationToTable={assignReservationToTable}
                    getReservationDropState={getReservationDropState}
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {pointerDraggedReservation && reservationPointerPosition ? (
        <div
          className="pointer-events-none fixed z-[120] max-w-[220px] -translate-y-1/2 rounded-full border border-orange-200 bg-white px-3 py-2 shadow-xl"
          style={{ left: reservationPointerPosition.clientX + 16, top: reservationPointerPosition.clientY - 16 }}
        >
          <p className="truncate text-sm font-semibold text-slate-950">{getReservationCustomerLabel(pointerDraggedReservation)}</p>
        </div>
      ) : null}

      <TableContextDrawer
        open={!isTemplateMode && !draggedReservationId && !reservationPointerDrag && (!!selectedReservation || !!selectedTable)}
        selectedReservation={selectedReservation}
        selectedTable={selectedTable}
        selectedTableIsReservable={selectedTableIsReservable}
        selectedReservationAssignedTable={selectedReservationAssignedTable}
        selectedReservationAssignedTableId={selectedReservationAssignedTableId}
        selectedTableAssignments={selectedTableAssignments}
        selectedReservationPaymentDetails={selectedReservationPaymentDetails}
        selectedReservationPreorderItems={selectedReservationPreorderItems}
        selectedReservationSpecialRequest={selectedReservationSpecialRequest}
        selectedPairDropState={selectedReservationAssignedTableDropState}
        compatibleTables={compatibleTablesForSelectedReservation}
        compatibleReservations={compatibleReservationsForSelectedTable}
        onOpenChange={(open) => !open && clearServiceSelection()}
        onClearSelection={clearServiceSelection}
        onAssignReservationToTable={assignReservationToTable}
        onReleaseReservation={clearReservationAssignment}
        onSelectReservation={(reservationId) => {
          setSelectedReservationId(reservationId);
          const assignedTableId = draftAssignments[reservationId];
          if (assignedTableId) setSelectedTableId(assignedTableId);
        }}
        onSelectTable={setSelectedTableId}
      />

      <TableConfigDialog
        open={tableConfigDialogOpen}
        onOpenChange={(next) => {
          setTableConfigDialogOpen(next);
          if (!next) {
            setPendingPresetId(null);
            setEditingSeatingTableId(null);
          }
        }}
        initialConfig={editingSeatingTableId ? (() => {
          const table = draftTables.find((draft) => draft.id === editingSeatingTableId);
          if (!table) return null;
          const resolved = getResolvedFloorPlanDimensions({
            capacity: table.capacity,
            shape: table.layout.shape,
            kind: table.layout.kind,
            seatType: table.layout.seatType,
            seatPlacements: table.layout.seatPlacements,
            cornerBenchCorners: table.layout.cornerBenchCorners,
            cornerBenchConfigs: table.layout.cornerBenchConfigs,
            tableWidth: table.layout.tableWidth,
            tableHeight: table.layout.tableHeight,
            footprintWidth: table.layout.w,
            footprintHeight: table.layout.h,
            cornerBenchHorizontal: table.layout.cornerBenchHorizontal,
            cornerBenchVertical: table.layout.cornerBenchVertical,
            cornerBenchDepth: table.layout.cornerBenchDepth,
          });
          return {
            capacity: table.capacity,
            shape: table.layout.shape,
            seatType: (table.layout.seatType || "chair") as FloorPlanSeatType,
            seatPlacements: resolved.seatPlacements,
            cornerBenchConfigs: resolved.cornerBenchConfigs,
            tableWidth: resolved.tableWidth,
            tableHeight: resolved.tableHeight,
          };
        })() : null}
        preset={pendingPresetId ? FLOOR_PLAN_PRESETS.find((preset) => preset.id === pendingPresetId) || null : null}
        onConfirm={confirmTableConfig}
      />
    </DashboardLayout>
  );
}
