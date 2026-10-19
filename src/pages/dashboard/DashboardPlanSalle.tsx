import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Copy,
  Pencil,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Users,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardIllustrationMedia from "@/components/dashboard/DashboardIllustrationMedia";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { askCommercialDemoAi, parseCommercialDemoAiJson } from "@/lib/commercialDemoAi";
import type { AIFloorPlanResult } from "@/components/floor-plan/FloorPlanAIPanel";
import SimpleReservationQueue from "@/components/floor-plan/SimpleReservationQueue";
import ServiceBoard from "@/components/floor-plan/ServiceBoard";
import StudioCanvas from "@/components/floor-plan/StudioCanvas";
import { clampFloorPlanZoom } from "@/components/floor-plan/useFloorPlanZoomViewport";
import StudioInspector from "@/components/floor-plan/StudioInspector";
import StudioPalette from "@/components/floor-plan/StudioPalette";
import TableConfigDialog from "@/components/floor-plan/TableConfigDialog";
import TableContextDrawer from "@/components/floor-plan/TableContextDrawer";
import { FLOOR_PLAN_TONE_CLASS } from "@/components/floor-plan/floorPlanTones";
import {
  getRecommendedTableByReservation,
  getReservationCustomerLabel,
  getReservationSpecialRequest,
  getSafeTime,
  getServiceReservationStatusLabel,
  getServiceReservationDurationMinutes,
  getServiceReservationActions,
  getPrimaryServiceReservation,
  getTableServiceState,
  isActiveServiceReservation,
  planAutomaticPlacement,
  scoreReservationPlacement,
} from "@/components/floor-plan/serviceShared";
import type { StudioLibraryTab } from "@/components/floor-plan/studioShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
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
import { buildFloorPlanWorkspaceRequest, getFloorPlanWorkspaceSaveError, type FloorPlanWorkspaceSaveResult } from "@/lib/floorPlanWorkspacePersistence";
import { isValidServiceDate } from "@/lib/floorPlanNavigation";
import { mergeFloorPlanAiLayout, restoreFloorPlanVariant } from "@/lib/floorPlanAiMerge";
import { seatRestaurantReservation, updateRestaurantReservationStatus } from "@/lib/reservationMutations";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";
import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";
import {
  transitionCommercialDemoReservation,
  type CommercialDemoReservationTransitionAction,
} from "@/lib/commercialDemoJourney";

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
type FloorPlanHistorySnapshot = {
  tables: DraftTable[];
  assignments: Record<string, string | null>;
  selectedTableId: string | null;
};

const DEFAULT_SECTOR = "Salle principale";
const DEFAULT_COUNTRY = "Suisse";
const CANVAS_WIDTH = 1040;
const CANVAS_HEIGHT = 760;
const FLOOR_PLAN_RESERVATIONS_LIMIT = 500;
const EMPTY_BRANCHES: BranchRow[] = [];
const EMPTY_TABLES: TableRow[] = [];
const EMPTY_RESERVATIONS: ReservationWithCustomer[] = [];
const EMPTY_SLOTS: SlotRow[] = [];
const EMPTY_LAYOUT_OVERRIDES: LayoutOverrideRow[] = [];
const EMPTY_FLOOR_PLAN_VARIANTS: FloorPlanVariantRow[] = [];

function buildCommercialDemoBranch(restaurantId: string, restaurant: Record<string, unknown>): BranchRow {
  return {
    id: restaurantId,
    restaurant_id: restaurantId,
    name: "Salle Démo principale",
    address: typeof restaurant.address === "string" ? restaurant.address : "18 rue de la Démonstration",
    city: typeof restaurant.city === "string" ? restaurant.city : "Genève",
    postal_code: typeof restaurant.postal_code === "string" ? restaurant.postal_code : "1204",
    country: typeof restaurant.country === "string" ? restaurant.country : DEFAULT_COUNTRY,
    is_active: true,
    created_at: "2026-07-15T08:00:00.000Z",
  };
}

function buildCommercialDemoTables(branchId: string): TableRow[] {
  return [
    { id: `${branchId}-t1`, branch_id: branchId, table_number: "Table 1", capacity: 2, is_active: true, sector: DEFAULT_SECTOR, layout: null },
    { id: `${branchId}-t2`, branch_id: branchId, table_number: "Table 2", capacity: 2, is_active: true, sector: DEFAULT_SECTOR, layout: null },
    { id: `${branchId}-t3`, branch_id: branchId, table_number: "Table 3", capacity: 4, is_active: true, sector: DEFAULT_SECTOR, layout: null },
    { id: `${branchId}-t4`, branch_id: branchId, table_number: "Table 4", capacity: 4, is_active: true, sector: DEFAULT_SECTOR, layout: null },
    { id: `${branchId}-t5`, branch_id: branchId, table_number: "Table 5", capacity: 6, is_active: true, sector: "Terrasse", layout: null },
    { id: `${branchId}-t6`, branch_id: branchId, table_number: "Table 6", capacity: 8, is_active: true, sector: "Terrasse", layout: null },
  ];
}

type CommercialDemoFloorPlanAiAction = "generate" | "optimize" | "suggest-furniture" | "custom";

function parseCommercialDemoFloorPlanAiResult(
  reply: string,
  action: CommercialDemoFloorPlanAiAction,
): AIFloorPlanResult {
  const parsed = parseCommercialDemoAiJson<{
    tables?: unknown;
    explanation?: unknown;
    variantName?: unknown;
    analysis?: unknown;
  }>(reply);
  if (!Array.isArray(parsed.tables) || parsed.tables.length === 0) {
    throw new Error("OpenAI n’a retourné aucun élément de plan exploitable.");
  }
  return {
    tables: parsed.tables as AIFloorPlanResult["tables"],
    explanation: String(parsed.explanation || "Disposition optimisée par OpenAI pour le restaurant Démo.").slice(0, 800),
    source: action,
    variantName: String(parsed.variantName || `Plan OpenAI - ${new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}`).slice(0, 120),
    analysis: {
      engine: "openai-commercial-demo",
      production_data: false,
      ...(parsed.analysis && typeof parsed.analysis === "object" && !Array.isArray(parsed.analysis)
        ? parsed.analysis as Record<string, unknown>
        : {}),
    },
  };
}

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);


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

function formatDateOnlyForQuery(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getReservationDateQueryBounds(referenceDate: string, timeRange: DashboardTimeRange) {
  const bounds = getDashboardTimeRangeBounds(referenceDate, timeRange);
  if (!bounds) return null;

  const start = new Date(bounds.start);
  const end = new Date(bounds.end);
  start.setDate(start.getDate() - 1);
  end.setDate(end.getDate() + 1);
  return { startIso: formatDateOnlyForQuery(start), endIso: formatDateOnlyForQuery(end) };
}

function getReservationBranchId(reservation: ReservationRow) {
  const branchId = (reservation as Record<string, unknown>).branch_id;
  return typeof branchId === "string" ? branchId : null;
}

function getReservationMetadataRecord(reservation: ReservationRow) {
  return isJsonRecord(reservation.metadata) ? reservation.metadata : {};
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
  const paidValue = typeof paidMetadata === "string" ? paidMetadata.trim().toLowerCase() : null;
  const isPaid = typeof paidMetadata === "boolean"
    ? paidMetadata
    : paidValue && ["true", "1", "yes", "paid"].includes(paidValue)
      ? true
      : paidValue && ["false", "0", "no", "unpaid"].includes(paidValue)
        ? false
        : null;

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

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getReservationService(reservation: ReservationRow) {
  const metadata = isJsonRecord(reservation.metadata) ? reservation.metadata : {};
  const explicitService = typeof metadata.service === "string" ? metadata.service.toLowerCase() : null;
  if (explicitService === "lunch" || explicitService === "dinner") return explicitService;
  return getServicePeriodFromMetadata(reservation.metadata, reservation.time);
}

function buildSchedule(reservation: ReservationWithCustomer) {
  return {
    id: reservation.id,
    date: reservation.date,
    time: reservation.time,
    partySize: Number(reservation.party_size || 0),
    status: reservation.status,
    durationMinutes: getServiceReservationDurationMinutes(reservation),
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

function getTableContentPadding(
  layout: FloorPlanTableLayout,
  capacity: number,
  zoom: number,
) {
  return resolveFloorPlanContentPadding(layout, capacity, zoom);
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
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const commercialDemoSessionId = commercialDemoFrame?.config.sessionId || null;
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const workspaceMutationLockRef = useRef(false);

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(searchParams.get("branch"));
  const [selectedSector, setSelectedSector] = useState(DEFAULT_SECTOR);
  const [extraSectors, setExtraSectors] = useState<string[]>([]);
  const [newSectorName, setNewSectorName] = useState("");
  const [referenceDate, setReferenceDate] = useState(() => isValidServiceDate(searchParams.get("date")) ? searchParams.get("date")! : getTodayReferenceDate());
  const [editMode, setEditMode] = useState<FloorPlanEditMode>("service");
  const timeRange: DashboardTimeRange = "day";
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>(() => ["lunch", "dinner"].includes(searchParams.get("service") || "") ? searchParams.get("service") as ServiceFilter : "all");
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
  const [tableConfigDialogOpen, setTableConfigDialogOpen] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const [editingSeatingTableId, setEditingSeatingTableId] = useState<string | null>(null);
  const [demoAiPrompt, setDemoAiPrompt] = useState("");
  const [demoAiLoading, setDemoAiLoading] = useState(false);
  const [demoReservationStatusOverrides, setDemoReservationStatusOverrides] = useState<Record<string, string>>({});

  type WorkspaceBaseline = {
    contextKey: string;
    tables: DraftTable[];
    rawTables: TableRow[];
    overrides: LayoutOverrideRow[];
    slots: SlotRow[];
  };
  const [workspaceBaseline, setWorkspaceBaseline] = useState<WorkspaceBaseline | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [hydrationVersion, setHydrationVersion] = useState(0);
  const forceHydrateContextRef = useRef<string | null>(null);
  const hydratedSourceRef = useRef<string | null>(null);
  const pendingSaveRequestsRef = useRef(new Map<string, { signature: string; requestId: string }>());
  const pendingReservationFocusRef = useRef<string | null>(searchParams.get("reservation"));
  const workspaceDraftsRef = useRef(new Map<string, {
    baseline: WorkspaceBaseline;
    snapshot: FloorPlanHistorySnapshot;
    history: FloorPlanHistory<FloorPlanHistorySnapshot>;
    sector: string;
    error: string | null;
  }>());
  const workspaceContextKey = [selectedId, selectedBranchId, referenceDate, editMode, commercialDemoSessionId || "live"].join(":");
  const workspaceContextRef = useRef(workspaceContextKey);
  workspaceContextRef.current = workspaceContextKey;
  const workspaceReady = workspaceBaseline?.contextKey === workspaceContextKey;
  const isTemplateMode = editMode === "template";
  const baselineTables = workspaceBaseline?.tables ?? EMPTY_TABLES as DraftTable[];
  const baselineSlots = workspaceBaseline?.slots ?? EMPTY_SLOTS;
  const localTablesDirty = !!workspaceBaseline && JSON.stringify(draftTables) !== JSON.stringify(baselineTables);
  const localAssignmentsDirty = !!workspaceBaseline && hasFloorPlanAssignmentChanges(draftAssignments, baselineSlots);
  const workspaceDirty = localTablesDirty || localAssignmentsDirty;

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
    if (workspaceMutationLockRef.current) return;
    const nextSnapshot = cloneHistorySnapshot(snapshot);
    // Adjacent dates are loaded to detect overnight conflicts. Editing this
    // service must never release a booking belonging to one of those dates.
    for (const [reservationId, tableId] of Object.entries(draftAssignmentsRef.current)) {
      if (reservationsById.get(reservationId)?.date !== referenceDate) {
        nextSnapshot.assignments[reservationId] = tableId;
      }
    }
    setFloorPlanHistory((current) => pushFloorPlanHistory(current, nextSnapshot, { isEqual: areHistorySnapshotsEqual }));
    applyHistorySnapshot(nextSnapshot);
  };
  const undoFloorPlan = () => {
    if (workspaceMutationLockRef.current) return;
    const nextHistory = undoFloorPlanHistory(floorPlanHistory);
    if (nextHistory === floorPlanHistory) return;
    setFloorPlanHistory(nextHistory);
    applyHistorySnapshot(nextHistory.present);
  };
  const redoFloorPlan = () => {
    if (workspaceMutationLockRef.current) return;
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

  useEffect(() => {
    if (!isCommercialDemo || !commercialDemoSessionId) {
      setDemoReservationStatusOverrides({});
      return;
    }
    setDemoReservationStatusOverrides(readCommercialDemoToolState<Record<string, string>>(
      commercialDemoSessionId,
      "floor-plan-reservation-statuses",
      {},
    ));
  }, [commercialDemoSessionId, isCommercialDemo]);

  const { data: restaurantDetails } = useQuery({
    queryKey: ["floor-plan-restaurant", selectedId, commercialDemoFrame?.config.sessionId || "live"],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame) {
        return commercialDemoFrame.snapshot.demo_restaurant as unknown as Record<string, unknown>;
      }
      const { data, error } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!selectedId,
    refetchOnWindowFocus: false,
  });

  const { data: branchesData, isLoading: branchesLoading, error: branchesError } = useQuery({
    queryKey: ["floor-plan-branches", selectedId, commercialDemoFrame?.config.sessionId || "live"],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame) {
        return [buildCommercialDemoBranch(
          commercialDemoFrame.snapshot.demo_restaurant.id,
          commercialDemoFrame.snapshot.demo_restaurant as unknown as Record<string, unknown>,
        )];
      }
      const { data, error } = await (supabase.from("restaurant_branches" as any))
        .select("*")
        .eq("restaurant_id", selectedId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BranchRow[];
    },
    enabled: !!selectedId,
    refetchOnWindowFocus: false,
  });
  const branches = branchesData ?? EMPTY_BRANCHES;

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) || null;

  const { data: floorPlanVariantsData, error: floorPlanVariantsError } = useQuery({
    queryKey: ["floor-plan-variants", selectedBranchId, commercialDemoFrame?.config.sessionId || "live"],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame) {
        return readCommercialDemoToolState<FloorPlanVariantRow[]>(
          commercialDemoFrame.config.sessionId,
          "floor-plan-variants",
          [],
        );
      }
      const { data, error } = await (supabase.from("floor_plan_variants" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FloorPlanVariantRow[];
    },
    enabled: !!selectedBranch,
    refetchOnWindowFocus: false,
  });
  const floorPlanVariants = floorPlanVariantsData ?? EMPTY_FLOOR_PLAN_VARIANTS;
  const activeVariant = activeVariantId
    ? floorPlanVariants.find((variant) => variant.id === activeVariantId) || null
    : null;

  const { data: persistedTablesData, isLoading: tablesLoading, error: tablesError } = useQuery({
    queryKey: ["floor-plan-tables", selectedBranchId, commercialDemoFrame?.config.sessionId || "live"],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame && selectedBranchId) {
        return readCommercialDemoToolState<TableRow[]>(
          commercialDemoFrame.config.sessionId,
          "floor-plan-tables",
          buildCommercialDemoTables(selectedBranchId),
        );
      }
      const { data, error } = await (supabase.from("reservation_tables" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("table_number", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TableRow[];
    },
    enabled: !!selectedBranch,
    refetchOnWindowFocus: false,
  });
  const persistedTables = persistedTablesData ?? EMPTY_TABLES;

  const { data: layoutOverridesData, isLoading: overridesLoading, error: layoutOverridesError } = useQuery({
    queryKey: ["floor-plan-layout-overrides", selectedBranchId, referenceDate, commercialDemoFrame?.config.sessionId || "live"],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame) {
        return readCommercialDemoToolState<LayoutOverrideRow[]>(
          commercialDemoFrame.config.sessionId,
          `floor-plan-overrides:${referenceDate}`,
          [],
        );
      }
      const { data, error } = await (supabase.from("reservation_table_layout_overrides" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .eq("service_date", referenceDate)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LayoutOverrideRow[];
    },
    enabled: !!selectedBranch,
    refetchOnWindowFocus: false,
  });
  const layoutOverrides = layoutOverridesData ?? EMPTY_LAYOUT_OVERRIDES;
  const reservationDateBounds = useMemo(
    () => getReservationDateQueryBounds(referenceDate, timeRange),
    [referenceDate, timeRange],
  );
  const floorPlanReservationsBaseQuery = {
    queryKey: ["floor-plan-reservations", selectedId, referenceDate, timeRange],
  };

  const { data: reservationsData, isLoading: reservationsLoading, error: reservationsError } = useQuery({
    queryKey: [
      ...floorPlanReservationsBaseQuery.queryKey,
      commercialDemoFrame?.config.sessionId || "live",
      commercialDemoFrame?.snapshot.reservations.map((reservation) => `${reservation.id}:${reservation.version}`).join("|") || "",
    ],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame) {
        return commercialDemoFrame.snapshot.reservations.map((reservation) => ({
          id: reservation.id,
          restaurant_id: commercialDemoFrame.snapshot.demo_restaurant.id,
          branch_id: commercialDemoFrame.snapshot.demo_restaurant.id,
          user_id: commercialDemoFrame.snapshot.session.id,
          date: reservation.reservation_date,
          time: reservation.reservation_time,
          party_size: reservation.party_size,
          status: reservation.status,
          notes: reservation.notes,
          feature: "reservation",
          metadata: {
            commercial_demo: true,
            reference: reservation.reference,
          },
          created_at: reservation.created_at,
          updated_at: reservation.updated_at,
          customer: {
            full_name: reservation.customer_name,
            phone: reservation.customer_phone || null,
          },
        })) as unknown as ReservationWithCustomer[];
      }
      const reservationRows: ReservationRow[] = [];
      for (let offset = 0; ; offset += FLOOR_PLAN_RESERVATIONS_LIMIT) {
        let reservationsQuery = supabase.from("reservations").select("*").eq("restaurant_id", selectedId!);
        if (reservationDateBounds) {
          reservationsQuery = reservationsQuery.gte("date", reservationDateBounds.startIso).lt("date", reservationDateBounds.endIso);
        }
        const { data, error } = await reservationsQuery
          .order("date", { ascending: true }).order("time", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + FLOOR_PLAN_RESERVATIONS_LIMIT - 1);
        if (error) throw error;
        reservationRows.push(...(data || []));
        if (!data || data.length < FLOOR_PLAN_RESERVATIONS_LIMIT) break;
      }
      if (!reservationRows?.length) return [] as ReservationWithCustomer[];

      const { data: profilesData, error: profilesError } = await supabase.rpc("get_reservation_customers" as any, {
        p_restaurant_id: selectedId!,
      });
      if (profilesError) throw profilesError;
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
    refetchOnWindowFocus: false,
  });
  const reservations = useMemo(() => {
    const source = reservationsData ?? EMPTY_RESERVATIONS;
    if (!isCommercialDemo) return source;
    return source.map((reservation) => {
      const override = demoReservationStatusOverrides[reservation.id];
      // `seated` is a restaurant-only operational state layered on the server
      // transition `arrived`; discard it automatically if the shared journey
      // later moves to another terminal state.
      return override === "seated" && reservation.status === "arrived"
        ? { ...reservation, status: "seated" }
        : reservation;
    }) as ReservationWithCustomer[];
  }, [demoReservationStatusOverrides, isCommercialDemo, reservationsData]);

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

  const { data: reservationSlotsData, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: ["floor-plan-slots", selectedBranchId, persistedTableIds.join(","), commercialDemoFrame?.config.sessionId || "live", referenceDate, reservations.map((reservation) => reservation.id).join(",")],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame) {
        return readCommercialDemoToolState<SlotRow[]>(
          commercialDemoFrame.config.sessionId,
          "floor-plan-slots",
          [],
        );
      }
      const rows: SlotRow[] = [];
      const tableIds = new Set(persistedTableIds);
      for (let offset = 0; offset < reservations.length; offset += 200) {
        const { data, error } = await (supabase.from("reservation_slots" as any))
          .select("id,reservation_id,table_id,created_at")
          .in("reservation_id", reservations.slice(offset, offset + 200).map((reservation) => reservation.id));
        if (error) throw error;
        rows.push(...((data || []) as unknown as SlotRow[]).filter((slot) => tableIds.has(slot.table_id)));
      }
      return rows;
    },
    enabled: !!selectedBranch && persistedTableIds.length > 0 && !reservationsLoading,
    refetchOnWindowFocus: false,
  });
  const reservationSlots = reservationSlotsData ?? EMPTY_SLOTS;

  // Tables attitrées : un client habitué retrouve sa table sans que le
  // restaurateur ait à y penser. La démo commerciale n'en a pas.
  const { data: preferredTablesData } = useQuery({
    queryKey: ["floor-plan-preferred-tables", selectedBranchId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurant_preferred_tables" as any))
        .select("user_id, table_id")
        .eq("branch_id", selectedBranchId!);
      if (error) throw error;
      return (data || []) as unknown as Array<{ user_id: string; table_id: string }>;
    },
    enabled: !!selectedBranch && !isCommercialDemo,
    refetchOnWindowFocus: false,
  });

  const preferredTableByUserId = useMemo(() => {
    const map = new Map<string, string>();
    (preferredTablesData || []).forEach((row) => {
      if (row.user_id && row.table_id) map.set(row.user_id, row.table_id);
    });
    return map;
  }, [preferredTablesData]);

  useEffect(() => {
    if (branchesLoading || !branchesData || branchesError) return;
    if (!branches.length) {
      setSelectedBranchId(null);
      return;
    }

    if (!selectedBranchId || !branches.some((branch) => branch.id === selectedBranchId)) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, branchesData, branchesError, branchesLoading, selectedBranchId]);

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

  const deferredReservationQuery = useDeferredValue(reservationQuery);
  const deferredLibraryQuery = useDeferredValue(libraryQuery);
  const normalizedReservationQuery = normalizeSearchText(deferredReservationQuery);
  const normalizedLibraryQuery = normalizeSearchText(deferredLibraryQuery);

  const serviceReservations = useMemo(() => branchScopedReservations.filter((reservation) => (
    isDateInDashboardTimeRange(reservation.date, timeRange, referenceDate, { dateOnly: true })
    && (serviceFilter === "all" || getReservationService(reservation) === serviceFilter)
  )), [branchScopedReservations, referenceDate, serviceFilter, timeRange]);
  const activeServiceReservations = useMemo(
    () => serviceReservations.filter(isActiveServiceReservation),
    [serviceReservations],
  );
  const historyReservations = useMemo(
    () => serviceReservations.filter((reservation) => !isActiveServiceReservation(reservation)),
    [serviceReservations],
  );
  const filteredReservations = useMemo(() => activeServiceReservations.filter((reservation) => {
    if (statusFilter !== "all" && String(reservation.status || "pending") !== statusFilter) return false;
    const assignedTable = draftTables.find((table) => table.id === draftAssignments[reservation.id]);
    const searchable = normalizeSearchText([
      getReservationCustomerLabel(reservation), reservation.customer?.phone, getSafeTime(reservation.time),
      String(reservation.party_size || ""), getServiceReservationStatusLabel(reservation.status),
      getReservationSpecialRequest(reservation), assignedTable?.table_number, assignedTable?.sector,
    ].filter(Boolean).join(" "));
    return !normalizedReservationQuery || searchable.includes(normalizedReservationQuery);
  }).sort((left, right) => sortReservations(left, right, sortBy)), [
    activeServiceReservations, draftAssignments, draftTables, normalizedReservationQuery, sortBy, statusFilter,
  ]);

  const effectiveCanvasZoom = clampFloorPlanZoom(canvasZoom);

  const floorPlanViewport = useMemo(
    () => buildFloorPlanViewportModel(draftTables, {
      sector: selectedSector,
      zoom: effectiveCanvasZoom,
      canvasWidth,
      canvasHeight,
      includeInactive: isTemplateMode,
    }),
    [canvasHeight, canvasWidth, draftTables, effectiveCanvasZoom, isTemplateMode, selectedSector],
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

  const visibleReservableTableIdSet = floorPlanViewport.visibleReservableIdSet;

  const occupancyReservations = useMemo(() => {
    const serviceDayStart = new Date(`${referenceDate}T00:00:00`).getTime();
    const activeIds = new Set(activeServiceReservations.map((reservation) => reservation.id));
    return branchScopedReservations.filter((reservation) => {
      if (activeIds.has(reservation.id)) return true;
      if (!isActiveServiceReservation(reservation) || reservation.date >= referenceDate || serviceFilter === "lunch") return false;
      const start = new Date(`${reservation.date}T${getSafeTime(reservation.time)}:00`).getTime();
      return start < serviceDayStart && start + getServiceReservationDurationMinutes(reservation) * 60_000 > serviceDayStart;
    });
  }, [activeServiceReservations, branchScopedReservations, referenceDate, serviceFilter]);

  const visibleAssignmentsByTable = useMemo(() => {
    const grouped = new Map<string, ReservationWithCustomer[]>();
    occupancyReservations.forEach((reservation) => {
      const tableId = draftAssignments[reservation.id];
      if (!tableId || !visibleReservableTableIdSet.has(tableId)) return;
      grouped.set(tableId, [...(grouped.get(tableId) || []), reservation]);
    });

    grouped.forEach((items, tableId) => {
      grouped.set(tableId, [...items].sort((left, right) => sortReservations(left, right, "time")));
    });

    return grouped;
  }, [draftAssignments, occupancyReservations, visibleReservableTableIdSet]);

  const activeServiceReservationId = draggedReservationId;
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
    return (visibleAssignmentsByTable.get(selectedTableId) || []);
  }, [selectedTableId, selectedTableIsReservable, visibleAssignmentsByTable]);

  const unassignedVisibleReservations = useMemo(
    () => filteredReservations.filter((reservation) => !draftAssignments[reservation.id]),
    [draftAssignments, filteredReservations],
  );
  const libraryPresets = useMemo(() => ({
    tables: FLOOR_PLAN_PRESETS.filter((preset) => preset.category === "table"),
    seating: FLOOR_PLAN_PRESETS.filter((preset) => ["chair", "stool", "sofa", "corner-bench", "banquette", "booth"].includes(preset.kind)),
    structure: FLOOR_PLAN_PRESETS.filter((preset) => ["bar", "host-stand", "divider", "service-station"].includes(preset.kind)),
    decor: FLOOR_PLAN_PRESETS.filter((preset) => ["plant"].includes(preset.kind)),
    event: FLOOR_PLAN_PRESETS.filter((preset) => ["dancefloor", "dj-booth", "stage", "buffet", "cake-table"].includes(preset.kind)),
  }), []);
  const filteredLibraryPresets = useMemo(() => {
    const matchesQuery = (preset: (typeof FLOOR_PLAN_PRESETS)[number]) => {
      if (!normalizedLibraryQuery) return true;
      return normalizeSearchText([preset.label, preset.description, preset.kind].join(" ")).includes(normalizedLibraryQuery);
    };
    return {
      tables: libraryPresets.tables.filter(matchesQuery),
      seating: libraryPresets.seating.filter(matchesQuery),
      structure: libraryPresets.structure.filter(matchesQuery),
      decor: libraryPresets.decor.filter(matchesQuery),
      event: libraryPresets.event.filter(matchesQuery),
    };
  }, [libraryPresets.decor, libraryPresets.event, libraryPresets.seating, libraryPresets.structure, libraryPresets.tables, normalizedLibraryQuery]);

  const templateDirty = isTemplateMode && workspaceReady && workspaceDirty;

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
    () => buildFloorPlanAssignmentSignature(draftAssignments, baselineSlots),
    [baselineSlots, draftAssignments],
  );
  const servicePersistenceSignature = useMemo(() => JSON.stringify({
    assignments: serviceAssignmentSignature,
    layout: serviceLayoutSignature,
  }), [serviceAssignmentSignature, serviceLayoutSignature]);
  const serviceLayoutDirty = !isTemplateMode && workspaceReady && localTablesDirty;
  const serviceAssignmentsDirty = !isTemplateMode && workspaceReady && localAssignmentsDirty;
  const serviceDirty = serviceLayoutDirty || serviceAssignmentsDirty;
  const availableTables = visibleReservableTables.filter((table) => getTableServiceState({ isReservable: true, assignments: visibleAssignmentsByTable.get(table.id) || [] }).key === "free");
  const assignedVisibleReservations = filteredReservations.filter((reservation) => !!draftAssignments[reservation.id]);
  const workspaceLoadError = restaurantsError || branchesError || tablesError || layoutOverridesError || reservationsError || slotsError;
  const workspaceLoading = branchesLoading || tablesLoading || overridesLoading || reservationsLoading || slotsLoading || !workspaceReady;
  const canPersist = !!selectedBranch && workspaceReady && !workspaceLoadError && !workspaceLoading && (isTemplateMode || !hasUnpersistedDraftTables);
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
  const recommendedTablesByReservationId = (() => {
    const getCurrentTableReservations = (tableId: string) => branchScopedReservations.filter((candidate) => {
      if (!isActiveServiceReservation(candidate)) return false;
      return draftAssignments[candidate.id] === tableId;
    });

    return getRecommendedTableByReservation({
      reservations: unassignedVisibleReservations,
      tables: visibleReservableTables,
      getReservationDropState: (reservationId, tableId) => getReservationDropStateForAssignments(reservationId, tableId, draftAssignments),
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
  })();
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

      if (isCommercialDemo && commercialDemoFrame) {
        return buildCommercialDemoBranch(
          commercialDemoFrame.snapshot.demo_restaurant.id,
          commercialDemoFrame.snapshot.demo_restaurant as unknown as Record<string, unknown>,
        );
      }

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
    onMutate: () => ({ restaurantId: selectedId, contextKey: workspaceContextKey }),
    onSuccess: (branch, _variables, context) => {
      if (context?.contextKey === workspaceContextRef.current) setSelectedBranchId(branch.id);
      queryClient.invalidateQueries({ queryKey: ["floor-plan-branches", context?.restaurantId] });
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
      if (isCommercialDemo && commercialDemoFrame) {
        const now = new Date().toISOString();
        const variant: FloorPlanVariantRow = {
          id: `demo-variant-${Date.now()}`,
          restaurant_id: selectedId,
          branch_id: selectedBranchId,
          name: input?.name?.trim() || (input?.source === "ai-image" ? "Plan IA image Démo" : "Plan enregistré Démo"),
          source: input?.source || "manual",
          snapshot,
          created_by: null,
          created_at: now,
          updated_at: now,
        };
        const variants = [variant, ...floorPlanVariants.filter((item) => item.id !== variant.id)];
        writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, "floor-plan-variants", variants);
        return variant;
      }
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
    onMutate: () => ({ contextKey: workspaceContextKey }),
    onSuccess: (variant, _variables, context) => {
      if (context?.contextKey === workspaceContextRef.current) setActiveVariantId(variant.id);
      queryClient.invalidateQueries({ queryKey: ["floor-plan-variants", variant.branch_id] });
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
      if (!selectedBranchId || !canPersist) throw new Error("Attendez le chargement complet du plan avant d’enregistrer.");
      const usedNames = new Set<string>();
      for (const table of draftTables) {
        const name = table.table_number.trim();
        if (!name || name.length > 40) throw new Error("Chaque élément doit avoir un nom de 1 à 40 caractères.");
        const uniqueName = name.toLocaleLowerCase("fr");
        if (usedNames.has(uniqueName)) throw new Error(`Le nom « ${name} » est utilisé plusieurs fois. Renommez l’un des éléments.`);
        usedNames.add(uniqueName);
      }

      if (isCommercialDemo && commercialDemoFrame) {
        const tables = draftTables.map((table) => ({
          id: table.id,
          branch_id: selectedBranchId,
          table_number: table.table_number,
          capacity: getPersistableCapacity(table),
          is_active: table.is_active,
          sector: table.sector,
          layout: layoutToRecord(table.layout),
        })) satisfies TableRow[];
        const slots = Object.entries(draftAssignments).flatMap(([reservationId, tableId]) => tableId ? [{
          id: `demo-slot-${reservationId}`,
          reservation_id: reservationId,
          table_id: tableId,
          created_at: new Date().toISOString(),
        }] : []);
        writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, "floor-plan-slots", slots);
        if (isTemplateMode) {
          writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, "floor-plan-tables", tables);
          queryClient.setQueryData(
            ["floor-plan-tables", selectedBranchId, commercialDemoFrame.config.sessionId],
            tables,
          );
        } else {
          const templateLayoutsByTableId = new Map(
            persistedTables.map((table, index) => [
              table.id,
              buildTemplateLayout(table.layout, index, Number.isFinite(Number(table.capacity)) ? Number(table.capacity) : 2),
            ]),
          );
          const now = new Date().toISOString();
          const overrides = draftTables.flatMap((table) => {
            const templateLayout = templateLayoutsByTableId.get(table.id);
            if (!templateLayout || areLayoutsEquivalent(table.layout, templateLayout)) return [];
            return [{
              id: `demo-override-${referenceDate}-${table.id}`,
              reservation_table_id: table.id,
              branch_id: selectedBranchId,
              service_date: referenceDate,
              layout: layoutToRecord(table.layout),
              created_at: now,
              updated_at: now,
            } satisfies LayoutOverrideRow];
          });
          writeCommercialDemoToolState(
            commercialDemoFrame.config.sessionId,
            `floor-plan-overrides:${referenceDate}`,
            overrides,
          );
          queryClient.setQueryData(
            ["floor-plan-layout-overrides", selectedBranchId, referenceDate, commercialDemoFrame.config.sessionId],
            overrides,
          );
        }
        queryClient.setQueryData(
          ["floor-plan-slots", selectedBranchId, tables.map((table) => table.id).join(","), commercialDemoFrame.config.sessionId],
          slots,
        );
        return { ...draftAssignments };
      }

      if (!workspaceBaseline) throw new Error("Rechargez la salle avant d’enregistrer.");
      const serviceDateReservationIds = new Set(branchScopedReservations
        .filter((reservation) => reservation.date === referenceDate).map((reservation) => reservation.id));
      const request = buildFloorPlanWorkspaceRequest({
        branchId: selectedBranchId,
        mode: editMode,
        serviceDate: referenceDate,
        requestId: "",
        rawTables: workspaceBaseline.rawTables,
        rawOverrides: workspaceBaseline.overrides,
        persistedSlots: workspaceBaseline.slots.filter((slot) => serviceDateReservationIds.has(slot.reservation_id)),
        draftTables,
        draftAssignments: Object.fromEntries(Object.entries(draftAssignments)
          .filter(([reservationId]) => serviceDateReservationIds.has(reservationId))),
      });
      const signature = JSON.stringify(request);
      if (pendingSaveRequestsRef.current.get(workspaceContextKey)?.signature !== signature) {
        pendingSaveRequestsRef.current.set(workspaceContextKey, { signature, requestId: crypto.randomUUID() });
      }
      const pendingRequest = pendingSaveRequestsRef.current.get(workspaceContextKey)!;
      const { data, error } = await (supabase.rpc as any)("restaurant_save_floor_plan_workspace_v3", {
        ...request,
        p_request_id: pendingRequest.requestId,
      });
      if (error) throw new Error(getFloorPlanWorkspaceSaveError(error));
      const result = data as FloorPlanWorkspaceSaveResult | null;
      if (!result || !result.id_map || !result.assignments || result.request_id !== pendingRequest.requestId) {
        throw new Error("Le serveur n’a pas confirmé la sauvegarde. Votre brouillon est conservé ; réessayez.");
      }
      return Object.fromEntries(Object.entries(draftAssignments).map(([reservationId, tableId]) => [
        reservationId, tableId ? result.id_map[tableId] || tableId : null,
      ]));
    },
    onMutate: () => {
      setSaveError(null);
      return { branchId: selectedBranchId, restaurantId: selectedId, date: referenceDate, contextKey: workspaceContextKey, templateMode: isTemplateMode };
    },
    onSuccess: async (_data, options, context) => {
      if (!context) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["floor-plan-tables", context.branchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-layout-overrides", context.branchId, context.date] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-slots", context.branchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-reservations", context.restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", context.restaurantId] }),
      ]);
      forceHydrateContextRef.current = context.contextKey;
      workspaceDraftsRef.current.delete(context.contextKey);
      setHydrationVersion((version) => version + 1);
      setSaveError(null);
      if (!context.templateMode && options?.layoutSignature) {
        lastAutoSavedLayoutSignatureRef.current = options.layoutSignature;
        scheduledAutoSaveLayoutSignatureRef.current = null;
      }
      if (!options?.silent) {
        toast({
          title: context.templateMode ? "Salle enregistrée" : "Plan du jour enregistré",
          description: context.templateMode
            ? "Le plan par défaut a été mis à jour pour les prochains jours."
            : `Les déplacements du ${formatDashboardDateHeading(context.date)} ont été enregistrés.`,
        });
      }
    },
    onError: (error: Error, options) => {
      setSaveError(error.message || "La sauvegarde a été refusée. Votre brouillon est conservé.");
      if (options?.source === "auto-layout") {
        scheduledAutoSaveLayoutSignatureRef.current = null;
        // Retiring the scheduled signature alone would re-arm this very save:
        // the effect depends on the mutation, the draft stays dirty, and a
        // server refusal is deterministic. Remember the refused state so the
        // restaurateur gets one actionable toast instead of one per second.
        // Any further edit changes the signature and re-enables the auto-save.
        lastAutoSavedLayoutSignatureRef.current = options.layoutSignature ?? null;
      }
      toast({
        title: options?.source === "auto-layout" ? "Erreur de sauvegarde auto" : "Erreur de sauvegarde",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const enterTemplateEditing = async () => {
    if (!selectedBranchId || isTemplateMode || mutationsDisabled) return;

    if (serviceDirty) {
      try {
        await saveMutation.mutateAsync({
          silent: false,
          source: "manual",
          layoutSignature: servicePersistenceSignature,
        });
      } catch {
        return;
      }
    }

    if (workspaceContextRef.current !== workspaceContextKey) return;
    setSelectedReservationId(null);
    setSelectedTableId(null);
    setToolPanelTab("library");
    setEditMode("template");
  };

  const finishTemplateEditing = async () => {
    if (!isTemplateMode || mutationsDisabled) return;

    if (templateDirty) {
      try {
        await saveMutation.mutateAsync({
          silent: false,
          source: "manual",
          layoutSignature: null,
        });
      } catch {
        return;
      }
    }

    if (workspaceContextRef.current !== workspaceContextKey) return;
    setSelectedTableId(null);
    setToolPanelTab("library");
    setEditMode("service");
  };

  const loadFloorPlanVariant = (variantId: string) => {
    if (!selectedBranchId || mutationsDisabled) return;
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

    const restored = restoreFloorPlanVariant({ current: draftTables, proposed: nextTables, assignments: draftAssignments });
    const nextSectors = Array.from(new Set(restored.tables.map((table) => table.sector).filter(Boolean)));
    setEditMode("template");
    setActiveVariantId(variant.id);
    setExtraSectors(nextSectors.filter((sector) => sector !== DEFAULT_SECTOR));
    setSelectedSector(nextSectors[0] || DEFAULT_SECTOR);
    commitHistorySnapshot(buildHistorySnapshot(restored.tables, restored.assignments, null));
    toast({
      title: "Plan chargé",
      description: "Les tables reconnues conservent leurs réservations. Ajustez la disposition, puis enregistrez la salle.",
    });
  };

  const updateReservationStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (isCommercialDemo && commercialDemoFrame) {
        const reservation = commercialDemoFrame.snapshot.reservations.find((item) => item.id === id);
        if (!reservation) throw new Error("Réservation Démo introuvable.");
        const localStatus = demoReservationStatusOverrides[id] === "seated" && reservation.status === "arrived"
          ? "seated"
          : reservation.status;
        if (localStatus === status) return { id, status };

        const persistLocalStatus = (nextStatus: string | null) => {
          setDemoReservationStatusOverrides((current) => {
            const next = { ...current };
            if (nextStatus) next[id] = nextStatus;
            else delete next[id];
            writeCommercialDemoToolState(
              commercialDemoFrame.config.sessionId,
              "floor-plan-reservation-statuses",
              next,
            );
            return next;
          });
        };

        if (status === "seated") {
          if (localStatus === "pending") {
            throw new Error("Confirmez d'abord la réservation avant d'installer le client.");
          }
          if (localStatus === "confirmed") {
            await transitionCommercialDemoReservation({
              reservationId: reservation.id,
              action: "restaurant_mark_arrived",
              expectedVersion: reservation.version,
            });
            await commercialDemoFrame.refresh();
          } else if (localStatus !== "arrived") {
            throw new Error("Cette réservation ne peut plus être installée.");
          }
          persistLocalStatus("seated");
          return { id, status: "seated" };
        }

        const actionByStatus: Partial<Record<string, CommercialDemoReservationTransitionAction>> = {
          confirmed: "restaurant_confirm",
          arrived: "restaurant_mark_arrived",
          no_show: "restaurant_mark_no_show",
          cancelled: "client_cancel",
        };
        const action = actionByStatus[status];
        if (!action) throw new Error("Cette transition n'est pas disponible dans le parcours Démo.");
        if (status === "confirmed" && localStatus !== "pending") {
          throw new Error("Seule une réservation en attente peut être confirmée.");
        }
        if (["arrived", "no_show"].includes(status) && localStatus !== "confirmed") {
          throw new Error("Confirmez d'abord la réservation avant cette action.");
        }
        await transitionCommercialDemoReservation({
          reservationId: reservation.id,
          action,
          expectedVersion: reservation.version,
        });
        persistLocalStatus(null);
        await commercialDemoFrame.refresh();
        return { id, status };
      }
      const result = status === "seated"
        ? await seatRestaurantReservation(id)
        : await updateRestaurantReservationStatus(id, status);
      if (!result.ok) {
        throw new Error(result.errorMessage);
      }

      return { id, status };
    },
    onMutate: async ({ id, status }) => {
      const queryKey = ["floor-plan-reservations", selectedId];
      await queryClient.cancelQueries({ queryKey });
      const previousQueries = queryClient.getQueriesData<ReservationWithCustomer[]>({ queryKey });
      queryClient.setQueriesData<ReservationWithCustomer[]>({ queryKey }, (current) => current?.map((reservation) => (
        reservation.id === id ? { ...reservation, status, updated_at: new Date().toISOString() } : reservation
      )));
      return { previousQueries, queryKey, restaurantId: selectedId, branchId: selectedBranchId };
    },
    onError: (error: Error, _variables, context) => {
      context?.previousQueries.forEach(([key, previous]) => queryClient.setQueryData(key, previous));
      toast({ title: "Statut non modifié", description: error.message, variant: "destructive" });
    },
    onSuccess: ({ status }) => {
      toast({ title: "Statut mis à jour", description: `Réservation : ${getServiceReservationStatusLabel(status)}.` });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context) return;
      void queryClient.invalidateQueries({ queryKey: context.queryKey });
      void queryClient.invalidateQueries({ queryKey: ["floor-plan-slots", context.branchId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", context.restaurantId] });
    },
  });

  const mutationsDisabled = saveMutation.isPending || updateReservationStatusMutation.isPending || refreshPending || workspaceLoading || !!workspaceLoadError;
  workspaceMutationLockRef.current = mutationsDisabled;

  // Accept one coherent server snapshot. Refreshes never replace a local draft or its undo history.
  useEffect(() => {
    if (workspaceBaseline && workspaceBaseline.contextKey !== workspaceContextKey && workspaceDirty && forceHydrateContextRef.current !== workspaceBaseline.contextKey) {
      workspaceDraftsRef.current.set(workspaceBaseline.contextKey, {
        baseline: workspaceBaseline,
        snapshot: buildHistorySnapshot(),
        history: floorPlanHistory,
        sector: selectedSector,
        error: saveError,
      });
    }
    if (!selectedBranch || tablesLoading || overridesLoading || reservationsLoading || slotsLoading
      || persistedTablesData === undefined || layoutOverridesData === undefined
      || (persistedTableIds.length > 0 && reservationSlotsData === undefined)
      || workspaceLoadError || saveMutation.isPending) return;

    const sourceSignature = JSON.stringify({ context: workspaceContextKey, tables: persistedTables, overrides: layoutOverrides, slots: reservationSlots });
    const forced = forceHydrateContextRef.current === workspaceContextKey;
    if (workspaceReady && workspaceDirty && !forced) return;
    if (workspaceReady && hydratedSourceRef.current === sourceSignature && !forced) return;

    const retainedDraft = !workspaceReady ? workspaceDraftsRef.current.get(workspaceContextKey) : undefined;
    if (retainedDraft && !forced) {
      setWorkspaceBaseline(retainedDraft.baseline);
      applyHistorySnapshot(retainedDraft.snapshot);
      setFloorPlanHistory(retainedDraft.history);
      setSelectedSector(retainedDraft.sector);
      setSelectedReservationId(null);
      setSaveError(retainedDraft.error);
      hydratedSourceRef.current = sourceSignature;
      return;
    }

    const nextTables: DraftTable[] = persistedTables.map((table, index) => {
      const rawCapacity = Number(table.capacity);
      const fallbackCapacity = Number.isFinite(rawCapacity) ? rawCapacity : 2;
      const layout = resolvedLayoutsByTableId.get(table.id) || buildTemplateLayout(table.layout, index, fallbackCapacity);
      return {
        id: table.id, persisted: true, branch_id: table.branch_id, table_number: table.table_number,
        capacity: isReservableFloorPlanItem(layout.kind) ? Math.max(1, Math.round(fallbackCapacity || 2)) : 0,
        is_active: table.is_active ?? true, sector: table.sector?.trim() || DEFAULT_SECTOR, layout,
      };
    });
    const nextAssignments = Object.fromEntries(reservationSlots.map((slot) => [slot.reservation_id, slot.table_id]));
    const nextSelectedTableId = workspaceReady && nextTables.some((table) => table.id === selectedTableIdRef.current)
      ? selectedTableIdRef.current : null;
    const snapshot = { tables: cloneDraftTables(nextTables), assignments: nextAssignments, selectedTableId: nextSelectedTableId };
    setWorkspaceBaseline({ contextKey: workspaceContextKey, tables: cloneDraftTables(nextTables), rawTables: persistedTables, overrides: layoutOverrides, slots: reservationSlots });
    applyHistorySnapshot(snapshot);
    setFloorPlanHistory((history) => resetFloorPlanHistory(history, snapshot));
    if (!workspaceReady) {
      setSelectedReservationId(null);
      setActiveVariantId(null);
      setExtraSectors([]);
      setSaveError(null);
      lastAutoSavedLayoutSignatureRef.current = null;
      scheduledAutoSaveLayoutSignatureRef.current = null;
    }
    hydratedSourceRef.current = sourceSignature;
    forceHydrateContextRef.current = null;
    workspaceDraftsRef.current.delete(workspaceContextKey);
  }, [
    workspaceBaseline, workspaceContextKey, workspaceDirty, selectedBranch, tablesLoading, overridesLoading,
    reservationsLoading, slotsLoading, persistedTablesData, layoutOverridesData, persistedTableIds.length,
    reservationSlotsData, workspaceLoadError, saveMutation.isPending, persistedTables, layoutOverrides,
    reservationSlots, workspaceReady, floorPlanHistory, selectedSector, resolvedLayoutsByTableId, hydrationVersion, saveError,
  ]);

  useEffect(() => {
    if (!workspaceReady || !pendingReservationFocusRef.current || reservationsLoading) return;
    const reservation = reservationsById.get(pendingReservationFocusRef.current);
    if (!reservation) return;
    pendingReservationFocusRef.current = null;
    setSelectedReservationId(reservation.id);
    const tableId = draftAssignments[reservation.id] || null;
    setSelectedTableId(tableId);
    const sector = tableId ? tableMap.get(tableId)?.sector : null;
    if (sector) setSelectedSector(sector);
  }, [draftAssignments, reservationsById, reservationsLoading, tableMap, workspaceReady]);

  useEffect(() => {
    if (!workspaceDirty && workspaceDraftsRef.current.size === 0) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [workspaceDirty, workspaceContextKey]);

  const refreshWorkspace = useCallback(async () => {
    if (saveMutation.isPending || updateReservationStatusMutation.isPending) return;
    setRefreshPending(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["floor-plan-branches", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-tables", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-layout-overrides", selectedBranchId, referenceDate] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-reservations", selectedId, referenceDate] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-slots", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-variants", selectedBranchId] }),
      ]);
    } finally { setRefreshPending(false); }
  }, [queryClient, referenceDate, saveMutation.isPending, selectedBranchId, selectedId, updateReservationStatusMutation.isPending]);

  useEffect(() => {
    if (isCommercialDemo || !selectedId || workspaceDirty || mutationsDisabled) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshWorkspace();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [isCommercialDemo, mutationsDisabled, refreshWorkspace, selectedId, workspaceDirty]);

  useEffect(() => {
    pendingReservationFocusRef.current = searchParams.get("reservation");
    const date = searchParams.get("date");
    if (isValidServiceDate(date) && !workspaceDirty && !saveMutation.isPending) setReferenceDate(date);
  }, [saveMutation.isPending, searchParams, workspaceDirty]);

  const changeReferenceDate = (value: string) => {
    if (!isValidServiceDate(value) || mutationsDisabled || workspaceDirty) return;
    setReferenceDate(value);
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("date", value); next.delete("reservation"); return next; }, { replace: true });
  };
  const shiftReferenceDate = (days: number) => {
    const date = new Date(`${referenceDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    changeReferenceDate(formatDateOnlyForQuery(date));
  };
  const openReservationDetails = async (reservationId?: string) => {
    if (mutationsDisabled) return;
    if (workspaceDirty) {
      try { await saveMutation.mutateAsync({ source: "manual", layoutSignature: servicePersistenceSignature }); }
      catch { return; }
    }
    if (workspaceContextRef.current !== workspaceContextKey) return;
    const params = new URLSearchParams({ date: referenceDate, service: serviceFilter });
    if (selectedBranchId) params.set("branch", selectedBranchId);
    if (reservationId) params.set("reservation", reservationId);
    navigate(`/dashboard/reservations?${params.toString()}`);
  };

  const changeReservationStatus = async (id: string, status: string) => {
    if (mutationsDisabled) return;
    const reservation = reservationsById.get(id);
    if (!reservation || !getServiceReservationActions(reservation).some((action) => action.status === status)) return;
    if (status === "seated" && !draftAssignments[id]) {
      toast({ title: "Choisissez une table", description: "Placez le client avant de l’installer.", variant: "destructive" });
      return;
    }
    if (serviceDirty) {
      try { await saveMutation.mutateAsync({ source: "manual", silent: true, layoutSignature: servicePersistenceSignature }); }
      catch { return; }
    }
    if (workspaceContextRef.current !== workspaceContextKey) return;
    updateReservationStatusMutation.mutate({ id, status });
  };

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    if (isTemplateMode || !selectedBranchId || hasUnpersistedDraftTables || !serviceDirty) {
      return undefined;
    }

    if (dragState || resizeState || rotateState || mutationsDisabled || saveError || !canPersist) {
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
    mutationsDisabled,
    saveError,
    canPersist,
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
    if (!selectedBranchId || !isTemplateMode || mutationsDisabled) {
      toast({
        title: "Modification indisponible",
        description: "Ouvrez « Modifier la salle » et attendez la fin du chargement.",
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
      sofa: { kind: "sofa", category: "furniture" },
      dancefloor: { kind: "dancefloor", category: "furniture" },
      "dj-booth": { kind: "dj-booth", category: "furniture" },
      stage: { kind: "stage", category: "furniture" },
      buffet: { kind: "buffet", category: "furniture" },
      "cake-table": { kind: "cake-table", category: "furniture" },
    };

    if (!result.tables.length || result.tables.length > 200) {
      toast({ title: "Proposition inexploitable", description: "Une proposition doit contenir entre 1 et 200 éléments.", variant: "destructive" });
      return;
    }
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

    const merged = mergeFloorPlanAiLayout({
      current: draftTables,
      proposed: newTables,
      sector: selectedSector,
      mode: result.source === "suggest-furniture" ? "append" : result.source === "generate" || result.source === "image-import" ? "replace" : "update",
      assignments: draftAssignments,
    });
    if (merged.tables.length > 200) {
      toast({ title: "Salle trop grande", description: "La salle peut contenir au maximum 200 éléments. Réduisez la proposition avant de l’appliquer.", variant: "destructive" });
      return;
    }
    commitHistorySnapshot(buildHistorySnapshot(merged.tables, merged.assignments, null));
    saveFloorPlanVariantMutation.mutate({
      name: result.variantName,
      source: result.source === "image-import" ? "ai-image" : "ai-generated",
      tables: merged.tables,
    });
    toast({
      title: "Proposition appliquée à la zone",
      description: `${selectedSector} : ${newTables.length} éléments proposés. Vous pouvez ajuster, annuler ou enregistrer la salle.`,
    });
  };

  const runCommercialDemoFloorPlanAi = async (action: CommercialDemoFloorPlanAiAction) => {
    if (!isCommercialDemo || !commercialDemoFrame || demoAiLoading) return;
    setDemoAiLoading(true);
    try {
      const currentTables = draftTables.filter((table) => table.sector === selectedSector).slice(0, 200).map((table) => ({
        table_number: table.table_number,
        capacity: table.capacity,
        sector: table.sector,
        x: table.layout.x,
        y: table.layout.y,
        w: table.layout.w,
        h: table.layout.h,
        rotation: table.layout.rotation,
        shape: table.layout.shape,
        kind: table.layout.kind,
        seatType: table.layout.seatType,
      }));
      const generated = await askCommercialDemoAi({
        runtime: {
          sessionId: commercialDemoFrame.config.sessionId,
          surface: "restaurant",
        },
        tool: "assistant",
        message: [
          `Conçois un plan de salle pour l’action « ${action} ».`,
          demoAiPrompt.trim() ? `Demande du restaurateur : ${demoAiPrompt.trim().slice(0, 500)}.` : "",
          `Le canevas mesure ${Math.round(canvasWidth)} × ${Math.round(canvasHeight)}.`,
          "Retourne exclusivement un objet JSON avec tables, explanation, variantName et analysis.",
          "Chaque table doit contenir table_number, capacity, kind, shape, x, y, w, h, rotation, seatType et seatLabels.",
          "Préserve des circulations réalistes, évite les chevauchements et reste dans le canevas.",
        ].filter(Boolean).join(" "),
        context: {
          entrypoint: "restaurant_floor_plan",
          action,
          current_tables: currentTables,
          canvas: { width: canvasWidth, height: canvasHeight },
          sector: selectedSector,
        },
      });
      if (workspaceContextRef.current !== workspaceContextKey) return;
      const result = parseCommercialDemoFloorPlanAiResult(generated.reply, action);
      applyAILayout(result);
      if (action === "custom") setDemoAiPrompt("");
      toast({
        title: "Plan généré par OpenAI",
        description: result.explanation,
      });
    } catch (error) {
      toast({
        title: "Génération du plan impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
        variant: "destructive",
      });
    } finally {
      setDemoAiLoading(false);
    }
  };

  const startDraggingTable = (event: React.PointerEvent<HTMLElement>, tableId: string) => {
    if (event.button !== 0 || workspaceMutationLockRef.current) return;
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
    if (event.button !== 0 || workspaceMutationLockRef.current) return;
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
    if (event.button !== 0 || workspaceMutationLockRef.current) return;
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
      if (!isActiveServiceReservation(candidate)) return false;
      return assignments[candidate.id] === tableId;
    }).length;
  }

  function getTableAssignedReservations(tableId: string, assignments: Record<string, string | null>) {
    return branchScopedReservations.filter((candidate) => {
      if (!isActiveServiceReservation(candidate)) return false;
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
      return { ok: false, reason: "Réservation ou table introuvable." };
    }

    if (reservation.date !== referenceDate) {
      return { ok: false, reason: "Ouvrez la date d’origine de cette réservation pour modifier son placement." };
    }

    if (!isActiveServiceReservation(reservation)) {
      return { ok: false, reason: "Cette réservation est terminée ou annulée et ne peut plus être placée." };
    }
    if (!table.is_active) {
      return { ok: false, reason: `${table.table_number} est masquée. Réactivez-la dans « Modifier la salle ».` };
    }
    if (!isReservableDraftTable(table)) {
      return {
        ok: false,
        reason: `${table.table_number} est un meuble décoratif. Choisissez une vraie table.`,
      };
    }

    if (Number(reservation.party_size) < 1 || Number(reservation.party_size) > table.capacity) {
      return {
        ok: false,
        reason: `${table.table_number} ne peut pas accueillir ${reservation.party_size} personnes.`,
      };
    }

    const targetSchedule = buildSchedule(reservation);
    const conflictingReservation = branchScopedReservations.find((candidate) => {
      if (candidate.id === reservationId) return false;
      if (!isActiveServiceReservation(candidate)) return false;
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
    if (mutationsDisabled) return;
    if (isTemplateMode) {
      toast({
        title: "Plan du jour requis",
        description: "Le placement automatique s'applique au service, pas au template.",
        variant: "destructive",
      });
      return;
    }

    // L'algorithme vit dans serviceShared (couvert par des tests unitaires) :
    // la page ne fournit que les règles métier du plan courant.
    const placed = planAutomaticPlacement({
      reservations: unassignedVisibleReservations.slice(0, 500),
      tables: visibleReservableTables,
      assignments: draftAssignments,
      preferredTableByUserId,
      canPlace: (reservationId, tableId, working) => (
        getReservationDropStateForAssignments(reservationId, tableId, working).ok
      ),
      getPlacementScore: (reservation, table, working) => scoreReservationPlacement({
        reservation,
        table,
        currentTableLoad: getTableAssignmentLoad(table.id, working),
        currentTableReservations: getTableAssignedReservations(table.id, working),
      }),
    });

    const placedCount = Object.keys(placed).length;
    if (placedCount === 0) {
      toast({
        title: "Aucun placement possible",
        description: unassignedVisibleReservations.length === 0
          ? "Toutes les réservations affichées ont déjà une table."
          : "Aucune réservation visible ne trouve une table compatible sans conflit.",
      });
      return;
    }

    const nextAssignments = { ...draftAssignments, ...placed };
    const lastReservationId = Object.keys(placed)[placedCount - 1];
    commitHistorySnapshot(buildHistorySnapshot(
      draftTables,
      nextAssignments,
      placed[lastReservationId] || selectedTableId,
    ));
    setSelectedReservationId(lastReservationId || null);

    const habitCount = Object.entries(placed).filter(([reservationId, tableId]) => {
      const reservation = reservationsById.get(reservationId);
      return !!reservation && preferredTableByUserId.get(reservation.user_id) === tableId;
    }).length;
    const remaining = unassignedVisibleReservations.length - placedCount;

    toast({
      title: `${placedCount} réservation${placedCount > 1 ? "s" : ""} placée${placedCount > 1 ? "s" : ""}`,
      description: [
        habitCount > 0 ? `${habitCount} habitué(s) à leur table` : null,
        remaining > 0 ? `${remaining} sans table libre assez grande` : null,
      ].filter(Boolean).join(" · ") || "Vous pouvez encore ajuster avant d'enregistrer.",
    });
  };

  const assignReservationToTable = (reservationId: string, tableId: string) => {
    if (mutationsDisabled) return;
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

  /** Attitre la table courante au client, ou retire l'attribution. */
  const setPreferredTableMutation = useMutation({
    mutationFn: async ({ userId, tableId }: { userId: string; tableId: string | null }) => {
      if (!selectedBranchId) throw new Error("Aucune salle sélectionnée.");
      const { error } = await (supabase.rpc as any)("restaurant_set_preferred_table", {
        p_branch_id: selectedBranchId,
        p_user_id: userId,
        p_table_id: tableId,
      });
      if (error) throw error;
      return { userId, tableId };
    },
    onSuccess: ({ tableId }) => {
      queryClient.invalidateQueries({ queryKey: ["floor-plan-preferred-tables", selectedBranchId] });
      toast({
        title: tableId ? "Table attitrée" : "Attribution retirée",
        description: tableId
          ? "À sa prochaine réservation, ce client retrouvera cette table si elle est libre."
          : "Ce client sera de nouveau placé comme les autres.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Attribution impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
        variant: "destructive",
      });
    },
  });

  const clearReservationAssignment = (reservationId: string) => {
    if (mutationsDisabled) return;
    if (reservationsById.get(reservationId)?.date !== referenceDate) {
      toast({ title: "Autre journée de service", description: "Ouvrez la date d’origine de cette réservation pour modifier son placement." });
      return;
    }
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
    setSelectedReservationId(reservationId);
    const assignedTableId = draftAssignments[reservationId] || null;
    setSelectedTableId(assignedTableId);
    const sector = assignedTableId ? tableMap.get(assignedTableId)?.sector : null;
    if (sector) setSelectedSector(sector);
  };

  const handleServiceTablePress = (tableId: string) => {
    setSelectedTableId(tableId);
    setSelectedReservationId(getPrimaryServiceReservation(visibleAssignmentsByTable.get(tableId) || [])?.id || null);
  };

  const handleReservationDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    reservationId: string,
  ) => {
    if (mutationsDisabled || !isActiveServiceReservation(reservationsById.get(reservationId)!)) { event.preventDefault(); return; }
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
    setCanvasZoom(clampFloorPlanZoom(nextZoom));
  };

  const revealResponsivePanel = (panelId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(panelId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
    reservations: activeServiceReservations.map((reservation) => ({
      id: reservation.id,
      partySize: Number(reservation.party_size || 0),
      assignedTableId: draftAssignments[reservation.id],
      date: reservation.date,
      time: reservation.time,
      durationMinutes: getServiceReservationDurationMinutes(reservation),
    })),
  }), [activeServiceReservations, draftAssignments, draftTables]);
  const floorPlanHealthTone = {
    ready: FLOOR_PLAN_TONE_CLASS.emerald,
    warning: FLOOR_PLAN_TONE_CLASS.amber,
    critical: FLOOR_PLAN_TONE_CLASS.rose,
  }[floorPlanHealth.status];
  const saveStatus = (() => {
    if (saveError) return { label: "Sauvegarde à reprendre", detail: "Votre brouillon est conservé. Corrigez le problème puis réessayez.", tone: FLOOR_PLAN_TONE_CLASS.rose };
    if (workspaceLoadError || workspaceLoading) return { label: workspaceLoadError ? "Données indisponibles" : "Chargement du plan", detail: "Les actions seront disponibles après le chargement du service.", tone: FLOOR_PLAN_TONE_CLASS.amber };
    if (saveMutation.isPending) {
      return {
        label: "Sauvegarde en cours",
        detail: "Les derniers ajustements sont en train d'être synchronisés.",
        tone: FLOOR_PLAN_TONE_CLASS.amber,
      };
    }

    if (isTemplateMode) {
      return templateDirty
        ? {
            label: "Salle modifiée",
            detail: hasUnpersistedDraftTables
              ? "De nouveaux éléments doivent être enregistrés avant de revenir au service."
              : "Les réglages de la salle doivent être enregistrés avant de revenir au service.",
            tone: FLOOR_PLAN_TONE_CLASS.amber,
          }
        : {
            label: "Salle enregistrée",
            detail: "La structure de salle est à jour.",
            tone: FLOOR_PLAN_TONE_CLASS.emerald,
          };
    }

    return serviceDirty
      ? {
          label: "Plan du jour modifié",
          detail: serviceAssignmentsDirty
            ? "Les derniers placements seront sauvegardés automatiquement."
            : "Les derniers déplacements seront sauvegardés automatiquement.",
          tone: FLOOR_PLAN_TONE_CLASS.sky,
        }
      : {
          label: "Plan du jour synchronisé",
          detail: "Les placements affichés correspondent à la version en base.",
          tone: FLOOR_PLAN_TONE_CLASS.emerald,
        };
  })();

  return (
    <DashboardLayout contentWidth="full" mainClassName="p-2 pb-24 sm:p-3 md:p-4">
      <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-3 xl:h-[calc(100vh-2rem)] xl:min-h-0 xl:overflow-hidden">
        <header className="shrink-0 rounded-2xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">Plan de salle</h1>
                <span aria-live="polite" title={saveStatus.detail} className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", saveStatus.tone)}>
                  {saveStatus.label}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {selectedRestaurant?.name || "Sélectionnez un restaurant"}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void openReservationDetails()} disabled={mutationsDisabled}>
                <CalendarDays className="mr-2 h-4 w-4" /> Réservations
              </Button>
              <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => void refreshWorkspace()} disabled={saveMutation.isPending || updateReservationStatusMutation.isPending || refreshPending} title={workspaceDirty ? "Actualiser les données en conservant votre brouillon et son historique." : "Actualiser les réservations et le plan"}>
                <RefreshCw className={cn("mr-2 h-4 w-4", refreshPending && "animate-spin")} /> Actualiser
              </Button>
              {/*
                Une seule vue : le plan du jour. Modifier la salle est un
                détour explicite, pas un onglet parallèle qu'il faut d'abord
                comprendre pour se servir de l'outil.
              */}
              {isTemplateMode ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-xl"
                  onClick={() => void finishTemplateEditing()}
                  disabled={mutationsDisabled}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {templateDirty ? "Enregistrer et terminer" : "Terminer"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => void enterTemplateEditing()}
                  disabled={!selectedBranch || mutationsDisabled}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {serviceDirty ? "Enregistrer puis modifier" : "Modifier la salle"}
                </Button>
              )}

              <div className="flex items-center rounded-xl border border-border bg-card p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  onClick={undoFloorPlan}
                  disabled={!canUndoFloorPlan || mutationsDisabled}
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
                  disabled={!canRedoFloorPlan || mutationsDisabled}
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
                    aria-controls="floor-plan-studio-tools"
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
                  disabled={!selectedBranch || unassignedVisibleReservations.length === 0 || mutationsDisabled}
                  title={`Placer ${unassignedVisibleReservations.length} client(s) affiché(s) dans ${selectedSector}`}
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
                disabled={
                  !canPersist
                  || mutationsDisabled
                  || (isTemplateMode ? !templateDirty : !serviceDirty)
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Sauvegarde…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </header>

        {restaurantsLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : null}
        {workspaceLoadError || floorPlanVariantsError ? (
          <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm", FLOOR_PLAN_TONE_CLASS.rose)}>
            <p><strong>Le plan n’a pas pu être chargé entièrement.</strong> Vos modifications locales sont conservées.</p>
            <Button type="button" variant="outline" onClick={() => void refreshWorkspace()} disabled={refreshPending || saveMutation.isPending || updateReservationStatusMutation.isPending}>Réessayer</Button>
          </div>
        ) : null}
        {saveError ? (
          <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm", FLOOR_PLAN_TONE_CLASS.rose)}>
            <div><p className="font-semibold">Sauvegarde impossible — votre brouillon est conservé.</p><p className="mt-1">{saveError}</p></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setDiscardDialogOpen(true)} disabled={saveMutation.isPending}>Abandonner le brouillon</Button>
              <Button type="button" onClick={() => saveMutation.mutate({ source: "manual", layoutSignature: servicePersistenceSignature })} disabled={!canPersist || mutationsDisabled}>Réessayer</Button>
            </div>
          </div>
        ) : workspaceReady && workspaceDirty && isTemplateMode ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-sm text-muted-foreground">
            <p>Vos modifications de salle s’appliqueront après enregistrement.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDiscardDialogOpen(true)} disabled={mutationsDisabled}>Abandonner le brouillon</Button>
          </div>
        ) : null}

        {!selectedId && !restaurantsLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Sélectionnez un restaurant pour ouvrir son plan de salle.
            </CardContent>
          </Card>
        ) : null}

        {selectedId && !branchesLoading && !branchesError && branchesData !== undefined && branches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <DashboardIllustrationMedia
                illustration={DASHBOARD_ILLUSTRATIONS.restaurantFloorPlan}
                className="h-36 w-36 bg-transparent sm:h-44 sm:w-44"
              />
              <div>
                <h2 className="text-lg font-bold text-foreground">Créez votre salle principale</h2>
                <p className="mt-1 text-sm text-muted-foreground">Vous pourrez ensuite ajouter et déplacer vos tables.</p>
              </div>
              <Button onClick={() => createDefaultBranchMutation.mutate()} disabled={createDefaultBranchMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                {createDefaultBranchMutation.isPending ? "Création…" : "Créer la salle"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {selectedBranch && !workspaceReady && !workspaceLoadError ? <p role="status" className="px-3 py-6 text-sm text-muted-foreground">Chargement du plan et des réservations…</p> : null}
        {selectedBranch && workspaceReady ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 xl:overflow-hidden">
            {/*
              Un sélecteur n'apparaît que s'il y a réellement un choix à faire :
              un restaurant d'une seule salle et d'une seule zone ne voit que la
              date et le service.
            */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
              {branches.length > 1 ? (
                <Select
                  value={selectedBranchId || ""}
                  onValueChange={(value) => {
                    setSelectedBranchId(value);
                    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("branch", value); next.delete("reservation"); return next; }, { replace: true });
                  }}
                  disabled={mutationsDisabled || workspaceDirty}
                >
                  <SelectTrigger className="h-11 w-[minmax(0,180px)] min-w-[150px] flex-1 rounded-xl border-border bg-card">
                    <SelectValue placeholder="Salle" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {sectorOptions.length > 1 ? (
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger className="h-11 min-w-[150px] flex-1 rounded-xl border-border bg-card">
                    <SelectValue placeholder="Zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectorOptions.map((sector) => (
                      <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {isTemplateMode ? (
                <Select
                  value={activeVariantId || "current"}
                  onValueChange={loadFloorPlanVariant}
                  disabled={mutationsDisabled || templateDirty}
                >
                  <SelectTrigger className="h-11 min-w-[180px] flex-1 rounded-xl border-border bg-card">
                    <SelectValue placeholder="Plan actif" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Salle enregistrée</SelectItem>
                    {floorPlanVariants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>{variant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Jour précédent" disabled={mutationsDisabled || workspaceDirty} onClick={() => shiftReferenceDate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Input
                    type="date"
                    value={referenceDate}
                    className="h-11 min-w-[150px] flex-1 rounded-xl border-border bg-card"
                    onChange={(event) => changeReferenceDate(event.target.value)}
                    disabled={mutationsDisabled || serviceDirty}
                    aria-label="Date du service"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Jour suivant" disabled={mutationsDisabled || workspaceDirty} onClick={() => shiftReferenceDate(1)}><ChevronRight className="h-4 w-4" /></Button>
                  {referenceDate !== getTodayReferenceDate() ? <Button type="button" variant="ghost" className="h-11" disabled={mutationsDisabled || workspaceDirty} onClick={() => changeReferenceDate(getTodayReferenceDate())}>Aujourd’hui</Button> : null}
                  <Select value={serviceFilter} onValueChange={(value) => {
                    setServiceFilter(value as ServiceFilter);
                    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("service", value); return next; }, { replace: true });
                  }}>
                    <SelectTrigger className="h-11 min-w-[140px] flex-1 rounded-xl border-border bg-card">
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

            {!isTemplateMode && activeServiceReservations.length > 0 ? (
              <div role="status" className={cn("flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs", floorPlanHealthTone)}>
                <p className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" /><strong>{floorPlanHealth.headline}</strong><span>{floorPlanHealth.detail}</span></p>
                <span>{activeServiceReservations.reduce((sum, reservation) => sum + Number(reservation.party_size || 0), 0)} couverts · {floorPlanHealth.activeReservableTables} tables actives · {floorPlanHealth.totalReservableCapacity} places</span>
              </div>
            ) : null}

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
                    className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm"
                  >
                    <TabsList className="grid h-10 w-full shrink-0 grid-cols-2 rounded-xl bg-muted p-1">
                      <TabsTrigger value="library" className="rounded-lg text-xs">Ajouter</TabsTrigger>
                      <TabsTrigger value="inspector" className="rounded-lg text-xs">Régler</TabsTrigger>
                    </TabsList>
                    <TabsContent value="library" className="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden">
                      {isCommercialDemo ? (
                        <div className="mb-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-xs font-semibold text-emerald-900">Assistant plan OpenAI · espace Démo</p>
                          <div className="grid grid-cols-3 gap-2">
                            <Button type="button" size="sm" variant="outline" disabled={demoAiLoading} onClick={() => void runCommercialDemoFloorPlanAi("generate")}>Générer</Button>
                            <Button type="button" size="sm" variant="outline" disabled={demoAiLoading} onClick={() => void runCommercialDemoFloorPlanAi("optimize")}>Optimiser</Button>
                            <Button type="button" size="sm" variant="outline" disabled={demoAiLoading} onClick={() => void runCommercialDemoFloorPlanAi("suggest-furniture")}>Mobilier</Button>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={demoAiPrompt}
                              onChange={(event) => setDemoAiPrompt(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && demoAiPrompt.trim()) void runCommercialDemoFloorPlanAi("custom");
                              }}
                              placeholder="Décris la disposition souhaitée"
                            />
                            <Button type="button" size="sm" disabled={!demoAiPrompt.trim() || demoAiLoading} onClick={() => void runCommercialDemoFloorPlanAi("custom")}>{demoAiLoading ? "Analyse…" : "Créer"}</Button>
                          </div>
                        </div>
                      ) : null}
                      <StudioPalette
                        key={`${selectedBranchId}:${selectedSector}`}
                        selectedId={isCommercialDemo ? null : selectedId}
                        selectedSector={selectedSector}
                        sectorOptions={sectorOptions}
                        libraryTab={libraryTab}
                        libraryQuery={libraryQuery}
                        canvasWidth={canvasWidth}
                        canvasHeight={canvasHeight}
                        draftTables={draftTables}
                        tablesLoading={tablesLoading || mutationsDisabled}
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
                  subtitle={`${formatDashboardDateHeading(referenceDate)} · ${activeServiceReservations.length} réservation(s) active(s)`}
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
                  selectedReservationId={draggedReservationId}
                  draggedReservationId={draggedReservationId}
                  dragOverTableId={dragOverTableId}
                  visibleTablesCount={visibleReservableTables.length}
                  availableTablesCount={availableTables.length}
                  unassignedReservationsCount={unassignedVisibleReservations.length}
                  onTablePress={handleServiceTablePress}
                  onPrimaryReservationPress={(reservationId, tableId) => {
                    setSelectedReservationId(reservationId);
                    setSelectedTableId(tableId);
                  }}
                  onReservationStatusChange={(reservationId, status) => void changeReservationStatus(reservationId, status)}
                  mutationsDisabled={mutationsDisabled}
                  pendingReservationStatusId={updateReservationStatusMutation.isPending ? updateReservationStatusMutation.variables?.id : null}
                  onReleaseReservation={clearReservationAssignment}
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
                  className="sticky bottom-3 z-30 h-12 rounded-2xl border-border bg-card shadow-xl xl:hidden"
                  onClick={() => revealResponsivePanel("floor-plan-reservation-queue")}
                  aria-controls="floor-plan-reservation-queue"
                  aria-label={`Afficher les clients : ${unassignedVisibleReservations.length} à placer`}
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
                    historyReservations={historyReservations}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    sortBy={sortBy}
                    onSortByChange={setSortBy}
                    mutationsDisabled={mutationsDisabled}
                    pendingReservationStatusId={updateReservationStatusMutation.isPending ? updateReservationStatusMutation.variables?.id : null}
                    onReservationStatusChange={(reservationId, status) => void changeReservationStatus(reservationId, status)}
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
          className="pointer-events-none fixed z-[120] max-w-[220px] -translate-y-1/2 rounded-full border border-primary/30 bg-popover px-3 py-2 shadow-xl"
          style={{
            left: Math.min(
              Math.max(8, reservationPointerPosition.clientX + 16),
              Math.max(8, window.innerWidth - 228),
            ),
            top: Math.min(
              Math.max(32, reservationPointerPosition.clientY - 16),
              Math.max(32, window.innerHeight - 32),
            ),
          }}
        >
          <p className="truncate text-sm font-semibold text-foreground">{getReservationCustomerLabel(pointerDraggedReservation)}</p>
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
        onReservationStatusChange={(reservationId, status) => void changeReservationStatus(reservationId, status)}
        pendingReservationStatusId={updateReservationStatusMutation.isPending ? updateReservationStatusMutation.variables?.id : null}
        mutationsDisabled={mutationsDisabled}
        onOpenReservationDetails={(reservationId) => void openReservationDetails(reservationId)}
        onReleaseReservation={clearReservationAssignment}
        onSelectReservation={(reservationId) => {
          setSelectedReservationId(reservationId);
          const assignedTableId = draftAssignments[reservationId];
          if (assignedTableId) setSelectedTableId(assignedTableId);
        }}
        onSelectTable={setSelectedTableId}
        preferredTableId={selectedReservation ? preferredTableByUserId.get(selectedReservation.user_id) ?? null : null}
        onSetPreferredTable={isCommercialDemo
          ? undefined
          : (userId, tableId) => setPreferredTableMutation.mutate({ userId, tableId })}
        preferredTablePending={setPreferredTableMutation.isPending}
      />

      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Abandonner le brouillon ?</AlertDialogTitle><AlertDialogDescription>Les changements non enregistrés de ce plan seront retirés. La dernière version disponible sera rechargée.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder mes modifications</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              workspaceDraftsRef.current.delete(workspaceContextKey);
              forceHydrateContextRef.current = workspaceContextKey;
              setSaveError(null);
              setHydrationVersion((version) => version + 1);
               void refreshWorkspace();
            }}>Abandonner le brouillon</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
