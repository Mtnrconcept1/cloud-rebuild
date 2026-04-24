import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Armchair,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Grip,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  LayoutPanelTop,
  Minus,
  Plus,
  Printer,
  Redo2,
  Search,
  Save,
  Sparkles,
  Store,
  Trash2,
  Undo2,
  UserRound,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { FloorPlanItemIllustration, FloorPlanPresetIcon } from "@/components/floor-plan/FloorPlanItemIllustration";
import FloorPlanAIPanel, { type AIFloorPlanResult } from "@/components/floor-plan/FloorPlanAIPanel";
import ReservationQueue from "@/components/floor-plan/ReservationQueue";
import ServiceBoard from "@/components/floor-plan/ServiceBoard";
import StudioCanvas from "@/components/floor-plan/StudioCanvas";
import StudioInspector from "@/components/floor-plan/StudioInspector";
import StudioPalette from "@/components/floor-plan/StudioPalette";
import TableConfigDialog from "@/components/floor-plan/TableConfigDialog";
import TableContextDrawer from "@/components/floor-plan/TableContextDrawer";
import type { StudioLibraryTab } from "@/components/floor-plan/studioShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  FLOOR_PLAN_PRESETS,
  buildDraftFloorPlanLayout,
  clampFloorPlanLayout,
  ensureFloorPlanLayoutFitsCapacity,
  getFloorPlanContentPadding as resolveFloorPlanContentPadding,
  getFloorPlanItemBaseName,
  getFloorPlanItemTypeLabel,
  getResolvedFloorPlanDimensions,
  isReservableFloorPlanItem,
  normalizeFloorPlanLayout,
  reservationsOverlap,
  resizeFloorPlanLayoutToFootprint,
  type FloorPlanCornerBenchConfig,
  type FloorPlanItemKind,
  type FloorPlanSeatPlacement,
  type FloorPlanSeatType,
  type FloorPlanTableLayout,
  type FloorPlanTablePreset,
  type FloorPlanTableShape,
} from "@/lib/floorPlan";
import {
  DASHBOARD_TIME_RANGE_OPTIONS,
  formatDashboardDateHeading,
  getTodayReferenceDate,
  isDateInDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/dashboardTimeRange";
import { formatRestaurantPaymentMethod } from "@/lib/dashboardPayments";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";

import { useDashboardRestaurant } from "./DashboardContext";

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
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type FloorPlanEditMode = "service" | "template";
type SaveMutationOptions = {
  silent?: boolean;
  source?: "manual" | "auto-layout";
  layoutSignature?: string | null;
};
type RenderedTableFrame = { x: number; y: number; w: number; h: number };
type TableDensity = "tight" | "compact" | "regular";

const DEFAULT_SECTOR = "Salle principale";
const DEFAULT_COUNTRY = "Suisse";
const CANVAS_WIDTH = 1040;
const CANVAS_HEIGHT = 680;
const MIN_CANVAS_ZOOM = 0.1;
const MAX_CANVAS_ZOOM = 1.8;
const CANVAS_ZOOM_STEP = 0.1;
const RELEASED_STATUSES = new Set(["cancelled", "canceled", "no_show", "completed", "archived"]);
const EMPTY_BRANCHES: BranchRow[] = [];
const EMPTY_TABLES: TableRow[] = [];
const EMPTY_RESERVATIONS: ReservationWithCustomer[] = [];
const EMPTY_SLOTS: SlotRow[] = [];
const EMPTY_LAYOUT_OVERRIDES: LayoutOverrideRow[] = [];
const PRIMARY_RESIZE_HANDLE: { key: ResizeHandle; className: string; cursor: string } = {
  key: "se",
  className: "bottom-2 right-2",
  cursor: "nwse-resize",
};
const SIDE_PANEL_TAB_LIST_CLASS = "grid h-auto min-h-12 w-full gap-1 rounded-2xl bg-slate-100 p-1";
const SIDE_PANEL_TAB_TRIGGER_CLASS = "min-w-0 whitespace-normal rounded-xl px-2 py-2 text-[10px] leading-tight uppercase tracking-[0.14em] sm:text-[11px]";
const SIDE_PANEL_PRESET_GRID_CLASS = "grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] gap-3";

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getSafeTime = (value: string | null | undefined) => (value && value.slice(0, 5)) || "00:00";

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

    const itemMetadata = isJsonRecord(item.metadata as Json) ? item.metadata as Record<string, Json> : {};
    return [{
      menuItemId: typeof item.menu_item_id === "string" && item.menu_item_id.trim() ? item.menu_item_id : null,
      name: typeof item.name === "string" && item.name.trim() ? item.name : "Article",
      quantity: Math.max(1, Math.round(parseReservationNumber(item.quantity) || 1)),
      unitPrice: parseReservationNumber(item.unit_price),
      totalPrice: parseReservationNumber(item.total_price),
      source: typeof item.source === "string" && item.source.trim() ? item.source : null,
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

function resizeRenderedTableFrame(
  frame: RenderedTableFrame,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minimumWidth: number,
  minimumHeight: number,
) {
  let nextLeft = frame.x;
  let nextTop = frame.y;
  let nextRight = frame.x + frame.w;
  let nextBottom = frame.y + frame.h;

  if (handle.includes("e")) {
    nextRight = Math.max(nextLeft + minimumWidth, nextRight + deltaX);
  }
  if (handle.includes("s")) {
    nextBottom = Math.max(nextTop + minimumHeight, nextBottom + deltaY);
  }
  if (handle.includes("w")) {
    nextLeft = Math.min(nextRight - minimumWidth, nextLeft + deltaX);
  }
  if (handle.includes("n")) {
    nextTop = Math.min(nextBottom - minimumHeight, nextTop + deltaY);
  }

  return {
    x: nextLeft,
    y: nextTop,
    w: nextRight - nextLeft,
    h: nextBottom - nextTop,
  };
}

function getTableContentPadding(
  layout: FloorPlanTableLayout,
  capacity: number,
  zoom: number,
) {
  return resolveFloorPlanContentPadding(layout, capacity, zoom);
}

function isReservableDraftTable(table: DraftTable | null | undefined) {
  return !!table && isReservableFloorPlanItem(table.layout.kind);
}

function getPersistableCapacity(table: DraftTable) {
  return isReservableDraftTable(table)
    ? Math.max(1, Math.round(table.capacity || 1))
    : 0;
}

function getRenderedTableFrame(
  layout: FloorPlanTableLayout,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const renderedWidth = layout.w * zoom;
  const renderedHeight = layout.h * zoom;
  const logicalMaxX = Math.max(16, canvasWidth - layout.w - 16);
  const logicalMaxY = Math.max(16, canvasHeight - layout.h - 16);
  const renderedMaxX = Math.max(16, canvasWidth - renderedWidth - 16);
  const renderedMaxY = Math.max(16, canvasHeight - renderedHeight - 16);
  const ratioX = logicalMaxX <= 16 ? 0 : (layout.x - 16) / (logicalMaxX - 16);
  const ratioY = logicalMaxY <= 16 ? 0 : (layout.y - 16) / (logicalMaxY - 16);

  return {
    x: 16 + (Math.max(0, Math.min(1, ratioX)) * (renderedMaxX - 16)),
    y: 16 + (Math.max(0, Math.min(1, ratioY)) * (renderedMaxY - 16)),
    w: renderedWidth,
    h: renderedHeight,
  };
}

function getLogicalPositionFromRenderedFrame(
  layout: FloorPlanTableLayout,
  renderedX: number,
  renderedY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const renderedWidth = layout.w * zoom;
  const renderedHeight = layout.h * zoom;
  const logicalMaxX = Math.max(16, canvasWidth - layout.w - 16);
  const logicalMaxY = Math.max(16, canvasHeight - layout.h - 16);
  const renderedMaxX = Math.max(16, canvasWidth - renderedWidth - 16);
  const renderedMaxY = Math.max(16, canvasHeight - renderedHeight - 16);
  const safeRenderedX = Math.min(Math.max(16, renderedX), renderedMaxX);
  const safeRenderedY = Math.min(Math.max(16, renderedY), renderedMaxY);
  const ratioX = renderedMaxX <= 16 ? 0 : (safeRenderedX - 16) / (renderedMaxX - 16);
  const ratioY = renderedMaxY <= 16 ? 0 : (safeRenderedY - 16) / (renderedMaxY - 16);

  return {
    x: 16 + (Math.max(0, Math.min(1, ratioX)) * (logicalMaxX - 16)),
    y: 16 + (Math.max(0, Math.min(1, ratioY)) * (logicalMaxY - 16)),
  };
}

function PanelSection({
  open,
  onOpenChange,
  title,
  description,
  badge,
  children,
  className,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={cn("min-w-0 rounded-2xl border border-slate-200 bg-white/90", className)}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
          {description ? (
            <p className="mt-1 break-words text-sm leading-5 text-slate-500">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-600 hover:bg-slate-100">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent className={cn("min-w-0 border-t border-slate-200 px-4 py-4", contentClassName)}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PalettePresetButton({
  preset,
  disabled,
  onClick,
}: {
  preset: FloorPlanTablePreset;
  disabled: boolean;
  onClick: () => void;
}) {
  const meta = preset.capacity ? `${preset.capacity} couverts` : (preset.description || "");

  return (
    <Button
      type="button"
      variant="outline"
      className="h-full min-w-0 whitespace-normal rounded-[22px] border-slate-200 bg-white px-3 py-4 text-center shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      onClick={onClick}
      disabled={disabled}
    >
      <div className="flex min-w-0 flex-col items-center text-center">
        <FloorPlanPresetIcon kind={preset.kind} shape={preset.shape} className="mb-3 h-14 w-14 shrink-0" />
        <span className="block w-full break-words text-sm font-semibold leading-5 text-slate-900">{preset.label}</span>
        <span className="mt-1 block w-full break-words text-[11px] leading-4 text-slate-500">{meta}</span>
      </div>
    </Button>
  );
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
  const [inspectorTab, setInspectorTab] = useState<"properties" | "layers">("properties");
  const [leftPanelView, setLeftPanelView] = useState<"library" | "reservations">("library");
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [showWorkspaceStats, setShowWorkspaceStats] = useState(false);
  const [leftSheetOpen, setLeftSheetOpen] = useState(false);
  const [panelSections, setPanelSections] = useState({
    libraryCatalog: true,
    librarySectors: false,
    libraryAI: false,
    reservationSearch: true,
    reservationList: true,
    inspectorReservation: true,
    inspectorReservationClient: true,
    inspectorReservationPayment: true,
    inspectorReservationItems: true,
    inspectorElement: true,
    inspectorElementDetails: true,
    inspectorElementActions: true,
    inspectorPlanning: true,
    layersElements: true,
    layersStats: true,
  });
  const [draftTables, setDraftTables] = useState<DraftTable[]>([]);
  const [draftAssignments, setDraftAssignments] = useState<Record<string, string | null>>({});
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ tableId: string; offsetX: number; offsetY: number } | null>(null);
  const [resizeState, setResizeState] = useState<{
    tableId: string;
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
    startAngle: number;
    startRotation: number;
  } | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasWidth, setCanvasWidth] = useState(CANVAS_WIDTH);
  const [tableConfigDialogOpen, setTableConfigDialogOpen] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const [editingSeatingTableId, setEditingSeatingTableId] = useState<string | null>(null);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const setPanelSectionOpen = (section: keyof typeof panelSections, open: boolean) => {
    setPanelSections((current) => ({ ...current, [section]: open }));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedLeftSidebar = window.localStorage.getItem("plan-salle-left-collapsed");
    const savedRightSidebar = window.localStorage.getItem("plan-salle-right-collapsed");
    const savedStats = window.localStorage.getItem("plan-salle-stats-open");

    if (savedLeftSidebar === "true" || savedLeftSidebar === "false") {
      setLeftSidebarCollapsed(savedLeftSidebar === "true");
    }
    if (savedRightSidebar === "true" || savedRightSidebar === "false") {
      setRightSidebarCollapsed(savedRightSidebar === "true");
    }
    if (savedStats === "true" || savedStats === "false") {
      setShowWorkspaceStats(savedStats === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("plan-salle-left-collapsed", String(leftSidebarCollapsed));
  }, [leftSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("plan-salle-right-collapsed", String(rightSidebarCollapsed));
  }, [rightSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("plan-salle-stats-open", String(showWorkspaceStats));
  }, [showWorkspaceStats]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return undefined;

    const updateWidth = () => {
      const nextWidth = Math.max(CANVAS_WIDTH, Math.floor(viewport.clientWidth));
      setCanvasWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

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
      return (data || []) as BranchRow[];
    },
    enabled: !!selectedId,
  });
  const branches = branchesData ?? EMPTY_BRANCHES;

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) || null;

  const { data: persistedTablesData, isLoading: tablesLoading, error: tablesError } = useQuery({
    queryKey: ["floor-plan-tables", selectedBranchId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("reservation_tables" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("table_number", { ascending: true });
      if (error) throw error;
      return (data || []) as TableRow[];
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
      return (data || []) as LayoutOverrideRow[];
    },
    enabled: !!selectedBranchId,
  });
  const layoutOverrides = layoutOverridesData ?? EMPTY_LAYOUT_OVERRIDES;

  const { data: reservationsData, isLoading: reservationsLoading, error: reservationsError } = useQuery({
    queryKey: ["floor-plan-reservations", selectedId],
    queryFn: async () => {
      const { data: reservationRows, error: reservationError } = await supabase
        .from("reservations")
        .select("*")
        .eq("restaurant_id", selectedId!)
        .order("date", { ascending: true })
        .order("time", { ascending: true });

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
      return (data || []) as SlotRow[];
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
    if (!selectedBranchId) {
      setDraftTables([]);
      setExtraSectors([]);
      setDraftAssignments({});
      return;
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }
    setDraftTables(
      persistedTables.map((table, index) => {
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
      }),
    );
    setExtraSectors([]);
  }, [persistedTables, resolvedLayoutsByTableId, selectedBranchId]);

  useEffect(() => {
    const nextAssignments = Object.fromEntries(
      reservationSlots.map((slot) => [slot.reservation_id, slot.table_id]),
    ) as Record<string, string | null>;
    setDraftAssignments(nextAssignments);
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

  const visibleTables = useMemo(() => (
    draftTables
      .filter((table) => table.is_active)
      .filter((table) => table.sector === selectedSector)
      .sort((left, right) => left.table_number.localeCompare(right.table_number, "fr"))
  ), [draftTables, selectedSector]);
  const visibleReservableTables = useMemo(
    () => visibleTables.filter((table) => isReservableDraftTable(table)),
    [visibleTables],
  );
  const visibleFurnitureCount = visibleTables.length - visibleReservableTables.length;

  const tableMap = useMemo(
    () => new Map(draftTables.map((table) => [table.id, table])),
    [draftTables],
  );

  const visibleTableIdSet = useMemo(
    () => new Set(visibleTables.map((table) => table.id)),
    [visibleTables],
  );
  const visibleReservableTableIdSet = useMemo(
    () => new Set(visibleReservableTables.map((table) => table.id)),
    [visibleReservableTables],
  );

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
  const availableTables = visibleReservableTables.filter((table) => !assignedVisibleTableIds.has(table.id));
  const availableCovers = availableTables.reduce((sum, table) => sum + table.capacity, 0);
  const assignedVisibleReservations = filteredReservations.filter((reservation) => !!draftAssignments[reservation.id]);
  const canPersist = !!selectedBranchId && (isTemplateMode || !hasUnpersistedDraftTables);
  const canvasZoomLabel = `${Math.round(canvasZoom * 100)}%`;
  const selectedReservationAssignedTableDropState = selectedReservation && selectedTable && selectedTableIsReservable
    ? getReservationDropState(selectedReservation.id, selectedTable.id)
    : null;
  const compatibleTablesForSelectedReservation = selectedReservation
    ? visibleReservableTables
      .filter((table) => getReservationDropState(selectedReservation.id, table.id).ok)
      .sort((left, right) => left.capacity - right.capacity || left.table_number.localeCompare(right.table_number, "fr"))
      .slice(0, 6)
    : [];
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
    for (let index = visibleReservableTables.length - 1; index >= 0; index -= 1) {
      const table = visibleReservableTables[index];
      const renderedFrame = getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT);
      const withinX = x >= renderedFrame.x && x <= renderedFrame.x + renderedFrame.w;
      const withinY = y >= renderedFrame.y && y <= renderedFrame.y + renderedFrame.h;
      if (withinX && withinY) {
        return table;
      }
    }

    return null;
  };

  useEffect(() => {
    if (!dragState && !resizeState && !rotateState) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      if (!point) return;

      if (rotateState) {
        const table = tableMap.get(rotateState.tableId);
        if (table) {
          const frame = getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT);
          const cx = frame.x + frame.w / 2;
          const cy = frame.y + frame.h / 2;
          const currentAngle = Math.atan2(point.y - cy, point.x - cx) * (180 / Math.PI);
          const delta = currentAngle - rotateState.startAngle;
          const snapped = Math.round((rotateState.startRotation + delta) / 15) * 15;
          const normalized = ((snapped % 360) + 360) % 360;
          setDraftTables((current) => current.map((t) =>
            t.id !== rotateState.tableId ? t : { ...t, layout: { ...t.layout, rotation: normalized } },
          ));
        }
      }

      if (dragState) {
        const nextRenderedX = point.x - dragState.offsetX;
        const nextRenderedY = point.y - dragState.offsetY;

        setDraftTables((current) => current.map((table) => {
          if (table.id !== dragState.tableId) return table;
          const nextPosition = getLogicalPositionFromRenderedFrame(
            table.layout,
            nextRenderedX,
            nextRenderedY,
            canvasZoom,
            canvasWidth,
            CANVAS_HEIGHT,
          );
          return {
            ...table,
            layout: {
              ...table.layout,
              x: nextPosition.x,
              y: nextPosition.y,
            },
          };
        }));
      }

      if (resizeState) {
        const deltaX = point.x - resizeState.startX;
        const deltaY = point.y - resizeState.startY;

        setDraftTables((current) => current.map((table) => {
          if (table.id !== resizeState.tableId) return table;
          const minimumSize = getResolvedFloorPlanDimensions({
            capacity: table.capacity,
            shape: resizeState.startLayout.shape,
            kind: resizeState.startLayout.kind,
            seatType: resizeState.startLayout.seatType,
            seatPlacements: resizeState.startLayout.seatPlacements,
            cornerBenchCorners: resizeState.startLayout.cornerBenchCorners,
            cornerBenchConfigs: resizeState.startLayout.cornerBenchConfigs,
            cornerBenchHorizontal: resizeState.startLayout.cornerBenchHorizontal,
            cornerBenchVertical: resizeState.startLayout.cornerBenchVertical,
            cornerBenchDepth: resizeState.startLayout.cornerBenchDepth,
          });
          const resizedFrame = resizeRenderedTableFrame(
            resizeState.startFrame,
            resizeState.handle,
            deltaX,
            deltaY,
            minimumSize.footprintWidth * canvasZoom,
            minimumSize.footprintHeight * canvasZoom,
          );
          const resizedLayout = resizeFloorPlanLayoutToFootprint(
            resizeState.startLayout,
            table.capacity,
            resizedFrame.w / canvasZoom,
            resizedFrame.h / canvasZoom,
            resizeState.startLayout.shape,
            resizeState.startLayout.kind,
          );
          const nextPosition = getLogicalPositionFromRenderedFrame(
            resizedLayout,
            resizedFrame.x,
            resizedFrame.y,
            canvasZoom,
            canvasWidth,
            CANVAS_HEIGHT,
          );
          return {
            ...table,
            layout: {
              ...resizedLayout,
              x: nextPosition.x,
              y: nextPosition.y,
            },
          };
        }));
      }
    };

    const handlePointerUp = () => {
      setDragState(null);
      setResizeState(null);
      setRotateState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [canvasWidth, canvasZoom, dragState, resizeState, rotateState, tableMap]);

  useEffect(() => {
    if (!reservationPointerDrag) return undefined;

    const clearReservationPointerDrag = () => {
      setReservationPointerDrag(null);
      setReservationPointerPosition(null);
      setDraggedReservationId(null);
      setDragOverTableId(null);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== reservationPointerDrag.pointerId) return;

      setReservationPointerPosition({
        clientX: event.clientX,
        clientY: event.clientY,
      });

      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      const hoveredTable = point ? getVisibleTableAtPointRef.current(point.x, point.y) : null;
      setDragOverTableId(hoveredTable?.id || null);

      if (event.cancelable) {
        event.preventDefault();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== reservationPointerDrag.pointerId) return;

      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      const hoveredTable = point ? getVisibleTableAtPointRef.current(point.x, point.y) : null;

      if (hoveredTable) {
        assignReservationToTableRef.current(reservationPointerDrag.reservationId, hoveredTable.id);
      }

      clearReservationPointerDrag();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== reservationPointerDrag.pointerId) return;
      clearReservationPointerDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
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
      setInspectorTab("properties");
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
      if (!selectedId) throw new Error("Aucun restaurant selectionne.");

      const branchCount = branches.length + 1;
      const address = typeof restaurantDetails?.address === "string" && restaurantDetails.address.trim()
        ? restaurantDetails.address.trim()
        : "Adresse a completer";
      const city = typeof restaurantDetails?.city === "string" && restaurantDetails.city.trim()
        ? restaurantDetails.city.trim()
        : "Ville a completer";
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
      return data as BranchRow;
    },
    onSuccess: (branch) => {
      setSelectedBranchId(branch.id);
      queryClient.invalidateQueries({ queryKey: ["floor-plan-branches", selectedId] });
      toast({
        title: "Plan de salle initialise",
        description: "La premiere salle est prete. Vous pouvez maintenant ajouter des tables.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (options?: SaveMutationOptions) => {
      void options;
      if (!selectedBranchId) throw new Error("Selectionnez d'abord une salle.");

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

        for (const reservationId of changedReservationIds) {
          const { error: deleteError } = await (supabase.from("reservation_slots" as any))
            .delete()
            .eq("reservation_id", reservationId);
          if (deleteError) throw deleteError;

          const nextTableId = normalizedAssignments[reservationId];
          if (!nextTableId) continue;

          const { error: slotError } = await (supabase.from("reservation_slots" as any))
            .insert({
              reservation_id: reservationId,
              table_id: nextTableId,
            });
          if (slotError) throw slotError;

          const { error: reservationError } = await supabase
            .from("reservations")
            .update({ branch_id: selectedBranchId })
            .eq("id", reservationId);
          if (reservationError) throw reservationError;
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
            tempIdToPersistedId.set(table.id, String(data.id));
          }
        }

        const nextPersistedIds = draftTables.filter((table) => table.persisted).map((table) => table.id);
        const removedIds = persistedTables
          .map((table) => table.id)
          .filter((tableId) => !nextPersistedIds.includes(tableId));

        if (removedIds.length > 0) {
          const { error } = await (supabase.from("reservation_tables" as any))
            .delete()
            .in("id", removedIds);
          if (error) throw error;
        }

        return persistAssignments(tempIdToPersistedId);
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
            ? "Le plan par defaut a ete mis a jour pour les prochains jours."
            : `Les deplacements du ${formatDashboardDateHeading(referenceDate)} ont ete enregistres.`,
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

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    if (isTemplateMode || !selectedBranchId || hasUnpersistedDraftTables || !serviceLayoutDirty) {
      return undefined;
    }

    if (dragState || resizeState || saveMutation.isPending) {
      return undefined;
    }

    if (
      lastAutoSavedLayoutSignatureRef.current === serviceLayoutSignature
      || scheduledAutoSaveLayoutSignatureRef.current === serviceLayoutSignature
    ) {
      return undefined;
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      scheduledAutoSaveLayoutSignatureRef.current = serviceLayoutSignature;
      saveMutation.mutate({
        silent: true,
        source: "auto-layout",
        layoutSignature: serviceLayoutSignature,
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
    saveMutation,
    selectedBranchId,
    serviceLayoutDirty,
    serviceLayoutSignature,
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
    setDraftTables((current) => current.map((table) => (table.id === tableId ? updater(table) : table)));
  };

  const updateDraftTableFootprint = (tableId: string, width: number, height: number) => {
    updateDraftTable(tableId, (table) => ({
      ...table,
      layout: ensureFloorPlanLayoutFitsCapacity(
        {
          ...table.layout,
          w: Math.round(width),
          h: Math.round(height),
        },
        table.capacity,
        table.layout.shape,
        table.layout.kind,
      ),
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
    setDraftTables((current) => current.filter((table) => table.id !== tableId));
    setDraftAssignments((current) => Object.fromEntries(
      Object.entries(current).map(([reservationId, assignedTableId]) => [
        reservationId,
        assignedTableId === tableId ? null : assignedTableId,
      ]),
    ));
    if (selectedTableId === tableId) {
      setSelectedTableId(null);
    }
  };

  const addTableFromPreset = (presetId: string) => {
    if (!selectedBranchId) {
      toast({ title: "Selection requise", description: "Selectionnez d'abord une salle.", variant: "destructive" });
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
    setDraftTables((current) => [
      ...current,
      {
        id: tableId,
        persisted: false,
        branch_id: selectedBranchId,
        table_number: getNextPresetLabel(current, preset),
        capacity: preset.capacity,
        is_active: true,
        sector: selectedSector,
        layout: buildDraftFloorPlanLayout(current.length, preset),
      },
    ]);
    setSelectedTableId(tableId);
  };

  const confirmTableConfig = (config: TableConfig) => {
    if (editingSeatingTableId) {
      updateDraftTable(editingSeatingTableId, (table) => ({
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
      setEditingSeatingTableId(null);
    } else if (pendingPresetId) {
      const preset = FLOOR_PLAN_PRESETS.find((item) => item.id === pendingPresetId);
      if (preset && selectedBranchId) {
        const tableId = `draft-${crypto.randomUUID()}`;
        setDraftTables((current) => [
          ...current,
          {
            id: tableId,
            persisted: false,
            branch_id: selectedBranchId,
            table_number: getNextPresetLabel(current, { ...preset, capacity: config.capacity, shape: config.shape }),
            capacity: config.capacity,
            is_active: true,
            sector: selectedSector,
            layout: ensureFloorPlanLayoutFitsCapacity(
              {
                ...buildDraftFloorPlanLayout(current.length, { ...preset, capacity: config.capacity, shape: config.shape }),
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
        ]);
        setSelectedTableId(tableId);
      }
      setPendingPresetId(null);
    }
    setTableConfigDialogOpen(false);
  };

  const duplicateTable = (sourceTableId: string) => {
    const source = draftTables.find((t) => t.id === sourceTableId);
    if (!source || !isTemplateMode) return;

    const tableId = `draft-${crypto.randomUUID()}`;
    setDraftTables((current) => [
      ...current,
      {
        ...source,
        id: tableId,
        persisted: false,
        table_number: getNextPresetLabel(current, {
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
        }),
      },
    ]);
    setSelectedTableId(tableId);
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
          },
          capacity,
          shape,
          mapped.kind,
        ),
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

    setDraftTables(newTables);
    setSelectedTableId(null);
    toast({
      title: "Disposition IA appliquee",
      description: `${newTables.length} elements places, ${newTables.reduce((s, t) => s + t.capacity, 0)} couverts au total.`,
    });
  };

  const startDraggingTable = (event: React.PointerEvent<HTMLElement>, tableId: string) => {
    event.preventDefault();
    setResizeState(null);
    setRotateState(null);

    const table = tableMap.get(tableId);
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!table || !point) return;
    const renderedFrame = getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT);

    setDragState({
      tableId,
      offsetX: point.x - renderedFrame.x,
      offsetY: point.y - renderedFrame.y,
    });
    setSelectedTableId(tableId);
  };

  const startRotatingTable = (event: React.PointerEvent<HTMLElement>, tableId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragState(null);
    setResizeState(null);

    const table = tableMap.get(tableId);
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!table || !point) return;
    const frame = getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT);
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const startAngle = Math.atan2(point.y - cy, point.x - cx) * (180 / Math.PI);

    setRotateState({
      tableId,
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
    event.preventDefault();
    event.stopPropagation();
    setDragState(null);

    const table = tableMap.get(tableId);
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    const renderedFrame = table ? getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT) : null;
    if (!table || !point || !renderedFrame) return;

    setResizeState({
      tableId,
      handle,
      startX: point.x,
      startY: point.y,
      startLayout: table.layout,
      startFrame: renderedFrame,
    });
    setSelectedTableId(tableId);
  };

  function getReservationDropState(reservationId: string, tableId: string) {
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
        reason: `${table.table_number} est deja pris autour de ${getSafeTime(conflictingReservation.time)}.`,
      };
    }

    return { ok: true as const, reason: null };
  }

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

    setDraftAssignments((current) => ({
      ...current,
      [reservationId]: tableId,
    }));
    setSelectedReservationId(reservationId);
    setSelectedTableId(tableId);
  };

  const clearReservationAssignment = (reservationId: string) => {
    setDraftAssignments((current) => ({ ...current, [reservationId]: null }));
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

  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    updateCanvasZoom(canvasZoom + (event.deltaY < 0 ? CANVAS_ZOOM_STEP : -CANVAS_ZOOM_STEP));
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
  const layerItems = useMemo(() => (
    visibleTables.map((table) => ({
      id: table.id,
      label: table.table_number,
      kindLabel: getFloorPlanItemTypeLabel(table.layout.kind, table.layout.shape),
      sector: table.sector,
      capacity: table.capacity,
    }))
  ), [visibleTables]);
  const placedReservationsCount = filteredReservations.length - unassignedVisibleReservations.length;
  const visibleCapacity = visibleReservableTables.reduce((sum, table) => sum + table.capacity, 0);
  const placementRate = filteredReservations.length > 0
    ? Math.round((placedReservationsCount / filteredReservations.length) * 100)
    : 0;
  const occupancyRate = visibleReservableTables.length > 0
    ? Math.round(((visibleReservableTables.length - availableTables.length) / visibleReservableTables.length) * 100)
    : 0;
  const selectedReservationService = selectedReservation ? getReservationService(selectedReservation) : null;
  const saveStatus = (() => {
    if (saveMutation.isPending) {
      return {
        label: "Sauvegarde en cours",
        detail: "Les derniers ajustements sont en train d'etre synchronises.",
        tone: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    if (isTemplateMode) {
      return hasUnpersistedDraftTables
        ? {
            label: "Template a enregistrer",
            detail: "De nouveaux elements doivent etre sauvegardes avant diffusion.",
            tone: "border-amber-200 bg-amber-50 text-amber-800",
          }
        : {
            label: "Template synchronise",
            detail: "La structure de salle est a jour.",
            tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
          };
    }

    return serviceLayoutDirty
      ? {
          label: "Plan du jour modifie",
          detail: "Les derniers deplacements seront sauvegardes automatiquement.",
          tone: "border-sky-200 bg-sky-50 text-sky-800",
        }
      : {
          label: "Plan du jour synchronise",
          detail: "Les placements affiches correspondent a la version en base.",
          tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
        };
  })();

  return (
    <DashboardLayout>
      <div className="flex min-h-[calc(100vh-5.5rem)] flex-col gap-4 xl:overflow-hidden">
        <div className="space-y-4 shrink-0">
          <div className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,248,252,0.96))] p-4 shadow-[0_24px_80px_-44px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <LayoutPanelTop className="h-7 w-7 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-[2rem] font-bold tracking-tight text-slate-900">PlanResto</h1>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]",
                        editMode === "template"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-sky-200 bg-sky-50 text-sky-700",
                      )}
                    >
                      {editMode === "template" ? "Mode template" : "Plan du jour"}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500">
                    {isTemplateMode
                      ? "Studio de conception pour la structure permanente de la salle."
                      : "Outil de placement optimise pour le service du jour, tablette ou desktop."}
                  </p>
                  {selectedRestaurant ? (
                    <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                      <Store className="h-3.5 w-3.5 text-slate-500" />
                      <span className="truncate">{selectedRestaurant.name}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 min-w-[120px] rounded-2xl border-slate-200 bg-white px-4 text-left shadow-sm"
                    onClick={() => createDefaultBranchMutation.mutate()}
                    disabled={!selectedId || createDefaultBranchMutation.isPending}
                  >
                    <div className="flex items-center gap-3">
                      <Plus className="h-4 w-4 text-slate-700" />
                      <div className="leading-tight">
                        <span className="block text-sm font-semibold text-slate-900">Nouveau</span>
                        <span className="block text-[11px] text-slate-500">Salle ou variante</span>
                      </div>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 min-w-[120px] rounded-2xl border-slate-200 bg-white px-4 text-left shadow-sm"
                    onClick={() => saveMutation.mutate({
                      silent: false,
                      source: "manual",
                      layoutSignature: isTemplateMode ? null : serviceLayoutSignature,
                    })}
                    disabled={!canPersist || saveMutation.isPending}
                  >
                    <div className="flex items-center gap-3">
                      <Save className="h-4 w-4 text-slate-700" />
                      <div className="leading-tight">
                        <span className="block text-sm font-semibold text-slate-900">
                          {saveMutation.isPending ? "Sauvegarde..." : "Enregistrer"}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {isTemplateMode ? "Template de salle" : "Plan du service"}
                        </span>
                      </div>
                    </div>
                  </Button>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                    <Button type="button" variant="ghost" size="icon" className="h-11 w-11 rounded-xl" disabled>
                      <Undo2 className="h-4 w-4 text-slate-400" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-11 w-11 rounded-xl" disabled>
                      <Redo2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                  <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex">
                    <Select value={String(canvasZoom)} onValueChange={(value) => updateCanvasZoom(Number(value))}>
                      <SelectTrigger className="h-10 w-[104px] rounded-xl border-0 bg-transparent px-2 shadow-none focus:ring-0">
                        <SelectValue placeholder={canvasZoomLabel} />
                      </SelectTrigger>
                      <SelectContent>
                        {[0.5, 0.75, 1, 1.25, 1.5].map((zoom) => (
                          <SelectItem key={zoom} value={String(zoom)}>
                            {Math.round(zoom * 100)}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    className="h-14 rounded-2xl px-5 text-sm shadow-sm"
                    onClick={() => window.print()}
                    disabled={!selectedBranch}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Apercu / Impression
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                    <Button
                      type="button"
                      size="sm"
                      variant={editMode === "service" ? "default" : "ghost"}
                      className="rounded-xl px-4"
                      onClick={() => setEditMode("service")}
                    >
                      Plan du jour
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={editMode === "template" ? "default" : "ghost"}
                      className="rounded-xl px-4"
                      onClick={() => setEditMode("template")}
                    >
                      Structure
                    </Button>
                  </div>
                  <div className={cn("rounded-2xl border px-4 py-2 text-sm shadow-sm", saveStatus.tone)}>
                    <p className="font-semibold">{saveStatus.label}</p>
                    <p className="text-xs opacity-80">{saveStatus.detail}</p>
                  </div>
                  {selectedBranch && isTemplateMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-2xl border-slate-200 bg-white px-3 shadow-sm xl:hidden"
                      onClick={() => setLeftSheetOpen(true)}
                    >
                      <PanelLeftOpen className="h-4 w-4 text-slate-600" />
                      <span className="ml-2">Panneaux</span>
                    </Button>
                  ) : null}
                  {selectedBranch && isTemplateMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="hidden h-11 rounded-2xl border-slate-200 bg-white px-3 shadow-sm xl:inline-flex"
                      onClick={() => setLeftSidebarCollapsed((current) => !current)}
                    >
                      {leftSidebarCollapsed ? (
                        <PanelLeftOpen className="h-4 w-4 text-slate-600" />
                      ) : (
                        <PanelLeftClose className="h-4 w-4 text-slate-600" />
                      )}
                      <span className="ml-2 hidden xl:inline">
                        {leftSidebarCollapsed ? "Ouvrir le menu" : "Replier le menu"}
                      </span>
                    </Button>
                  ) : null}
                  {selectedBranch && isTemplateMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="hidden h-11 rounded-2xl border-slate-200 bg-white px-3 shadow-sm xl:inline-flex"
                      onClick={() => setRightSidebarCollapsed((current) => !current)}
                    >
                      {rightSidebarCollapsed ? (
                        <PanelRightOpen className="h-4 w-4 text-slate-600" />
                      ) : (
                        <PanelRightClose className="h-4 w-4 text-slate-600" />
                      )}
                      <span className="ml-2 hidden 2xl:inline">
                        {rightSidebarCollapsed ? "Ouvrir l'inspecteur" : "Replier l'inspecteur"}
                      </span>
                    </Button>
                  ) : null}
                  {selectedBranch && !isTemplateMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-2xl border-slate-200 bg-white px-3 shadow-sm"
                      onClick={() => setShowWorkspaceStats((current) => !current)}
                    >
                      {showWorkspaceStats ? (
                        <ChevronUp className="h-4 w-4 text-slate-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-600" />
                      )}
                      <span className="ml-2 hidden xl:inline">
                        {showWorkspaceStats ? "Masquer les stats" : "Afficher les stats"}
                      </span>
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-2xl border-slate-200 bg-white shadow-sm">
                    <HelpCircle className="h-4 w-4 text-slate-600" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {restaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {restaurantsError ? <p className="text-destructive">Erreur restaurants : {restaurantsError}</p> : null}
        {branchesError ? <p className="text-destructive">Erreur salles : {(branchesError as Error).message}</p> : null}
        {tablesError ? <p className="text-destructive">Erreur tables : {(tablesError as Error).message}</p> : null}
        {layoutOverridesError ? <p className="text-destructive">Erreur plan du jour : {(layoutOverridesError as Error).message}</p> : null}
        {reservationsError ? <p className="text-destructive">Erreur reservations : {(reservationsError as Error).message}</p> : null}
        {slotsError ? <p className="text-destructive">Erreur affectations : {(slotsError as Error).message}</p> : null}

        {!selectedId && !restaurantsLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Selectionnez un restaurant depuis la barre laterale pour ouvrir son plan de salle.
            </CardContent>
          </Card>
        ) : null}

        {selectedId && !branchesLoading && branches.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>Commencer par une salle principale</CardTitle>
              <CardDescription>
                Le plan de salle s'appuie sur une branche de service. Creez-en une premiere, puis ajoutez vos tables et vos secteurs.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button onClick={() => createDefaultBranchMutation.mutate()} disabled={createDefaultBranchMutation.isPending}>
                <Sparkles className="mr-2 h-4 w-4" />
                {createDefaultBranchMutation.isPending ? "Creation..." : "Creer la salle principale"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Adresse pre-remplie a partir de la fiche restaurant, editable ensuite si besoin.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {selectedBranch ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className={cn(
              "grid gap-3 rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,246,251,0.96))] p-4 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.35)]",
              isTemplateMode ? "md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,1.15fr)]" : "md:grid-cols-2 xl:grid-cols-7",
            )}>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Salle</p>
                <Select value={selectedBranchId || ""} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Secteur</p>
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                    <SelectValue placeholder="Secteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectorOptions.map((sector) => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isTemplateMode ? (
                <div className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Mode structure</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">Template global du secteur</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    La construction reste independante du service. Le canevas garde son scroll local, les panneaux se replient avant de le tronquer.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Periode</p>
                    <Select value={timeRange} onValueChange={(value) => setTimeRange(value as DashboardTimeRange)}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                        <SelectValue placeholder="Periode" />
                      </SelectTrigger>
                      <SelectContent>
                        {DASHBOARD_TIME_RANGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Date</p>
                    <Input type="date" value={referenceDate} className="h-12 rounded-2xl border-slate-200 bg-white" onChange={(event) => setReferenceDate(event.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Service</p>
                    <Select value={serviceFilter} onValueChange={(value) => setServiceFilter(value as ServiceFilter)}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                        <SelectValue placeholder="Tous" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous</SelectItem>
                        <SelectItem value="lunch">Midi</SelectItem>
                        <SelectItem value="dinner">Soir</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Statut</p>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                        <SelectValue placeholder="Tous" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status === "all" ? "Tous" : status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Tri</p>
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                        <SelectValue placeholder="Heure" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Heure d'arrivee</SelectItem>
                        <SelectItem value="party_size">Taille du groupe</SelectItem>
                        <SelectItem value="status">Statut</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            {showWorkspaceStats && !isTemplateMode ? (
            <div className="grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm">
                <CardContent className="flex items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Elements visibles</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{visibleTables.length}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {visibleReservableTables.length} table(s) • {visibleFurnitureCount} mobilier(s)
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <Armchair className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm">
                <CardContent className="flex items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reservations</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{filteredReservations.length}</p>
                    <p className="mt-1 text-sm text-slate-500">{placedReservationsCount} placee(s) • {placementRate}% affectees</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm">
                <CardContent className="flex items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Capacite</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{visibleCapacity}</p>
                    <p className="mt-1 text-sm text-slate-500">{availableCovers} couvert(s) libres • {occupancyRate}% d'occupation</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <Users className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-slate-200/80 bg-white shadow-sm">
                <CardContent className="flex items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Salle active</p>
                    <p className="mt-2 text-lg font-bold text-slate-900">{selectedBranch.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedBranch.city} • {selectedBranch.address}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                    <LayoutPanelTop className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </div>
            ) : null}

            {isTemplateMode ? (
              <div
                className={cn(
                  "grid min-h-0 flex-1 gap-5 transition-[grid-template-columns] duration-300",
                  leftSidebarCollapsed
                    ? rightSidebarCollapsed
                      ? "xl:grid-cols-[92px_minmax(0,1fr)_92px]"
                      : "xl:grid-cols-[92px_minmax(0,1fr)_320px]"
                    : rightSidebarCollapsed
                      ? "xl:grid-cols-[320px_minmax(0,1fr)_92px]"
                      : "xl:grid-cols-[320px_minmax(0,1fr)_320px]",
                )}
              >
                <div className={cn("hidden min-h-0 xl:flex xl:flex-col", leftSidebarCollapsed && "xl:w-[92px]")}>
                  {leftSidebarCollapsed ? (
                    <div className="space-y-3">
                      <div className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] p-3 shadow-[0_24px_80px_-44px_rgba(15,23,42,0.4)]">
                        <div className="flex flex-col items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                            onClick={() => setLeftSidebarCollapsed(false)}
                            title="Ouvrir la palette"
                          >
                            <PanelLeftOpen className="h-4 w-4 text-slate-700" />
                          </Button>
                          <div className="h-px w-full bg-slate-200" />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                            onClick={() => {
                              setLibraryTab("tables");
                              setLeftSidebarCollapsed(false);
                            }}
                            title="Ouvrir les tables"
                          >
                            <LayoutPanelTop className="h-4 w-4 text-slate-700" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                            onClick={() => {
                              setLibraryTab("seating");
                              setLeftSidebarCollapsed(false);
                            }}
                            title="Ouvrir les assises"
                          >
                            <Armchair className="h-4 w-4 text-slate-700" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                            onClick={() => {
                              setLibraryTab("structure");
                              setLeftSidebarCollapsed(false);
                            }}
                            title="Ouvrir la structure"
                          >
                            <Store className="h-4 w-4 text-slate-700" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                            onClick={() => {
                              setLibraryTab("decor");
                              setLeftSidebarCollapsed(false);
                            }}
                            title="Ouvrir le decor"
                          >
                            <Sparkles className="h-4 w-4 text-slate-700" />
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] px-3 py-4 text-center shadow-[0_24px_80px_-44px_rgba(15,23,42,0.3)]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Secteur</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{selectedSector}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{visibleTables.length} element(s)</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 rounded-2xl border-slate-200 bg-white px-3 shadow-sm"
                          onClick={() => setLeftSidebarCollapsed(true)}
                        >
                          <PanelLeftClose className="h-4 w-4 text-slate-600" />
                          <span className="ml-2">Replier la palette</span>
                        </Button>
                      </div>
                      <StudioPalette
                        selectedId={selectedId}
                        selectedSector={selectedSector}
                        sectorOptions={sectorOptions}
                        libraryTab={libraryTab}
                        libraryQuery={libraryQuery}
                        draftTables={draftTables}
                        tablesLoading={tablesLoading}
                        newSectorName={newSectorName}
                        onLibraryTabChange={setLibraryTab}
                        onLibraryQueryChange={setLibraryQuery}
                        onPresetClick={addTableFromPreset}
                        onSectorSelect={setSelectedSector}
                        onNewSectorNameChange={setNewSectorName}
                        onAddSector={addSector}
                        onApplyAILayout={applyAILayout}
                        presetsByTab={filteredLibraryPresets}
                      />
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-5">
                  <StudioCanvas
                    selectedSector={selectedSector}
                    canvasWidth={canvasWidth}
                    canvasZoom={canvasZoom}
                    canvasZoomLabel={canvasZoomLabel}
                    canvasRef={canvasRef}
                    canvasViewportRef={canvasViewportRef}
                    visibleTables={visibleTables}
                    selectedTableId={selectedTableId}
                    draggingTableId={dragState?.tableId || resizeState?.tableId || rotateState?.tableId || null}
                    onTablePress={setSelectedTableId}
                    onCanvasWheel={handleCanvasWheel}
                    onCanvasBackgroundPress={() => setSelectedTableId(null)}
                    onStartDraggingTable={startDraggingTable}
                    onStartResizingTable={(event, tableId, handle) => startResizingTable(event, tableId, handle)}
                    onStartRotatingTable={startRotatingTable}
                    onUpdateCanvasZoom={updateCanvasZoom}
                    getRenderedFrame={(table) => getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT)}
                  />

                  <div className="xl:hidden">
                    <StudioInspector
                      selectedTable={selectedTable}
                      selectedTableIsReservable={selectedTableIsReservable}
                      selectedTableDimensions={selectedTableDimensions}
                      sectorOptions={sectorOptions}
                      onRename={(value) => {
                        if (!selectedTable) return;
                        updateDraftTable(selectedTable.id, (table) => ({
                          ...table,
                          table_number: value,
                        }));
                      }}
                      onSectorChange={(value) => {
                        if (!selectedTable) return;
                        updateDraftTable(selectedTable.id, (table) => ({
                          ...table,
                          sector: value,
                        }));
                      }}
                      onRotationChange={(value) => {
                        if (!selectedTable) return;
                        updateDraftTable(selectedTable.id, (table) => ({
                          ...table,
                          layout: { ...table.layout, rotation: value },
                        }));
                      }}
                      onRotateIncrement={() => {
                        if (!selectedTable) return;
                        updateDraftTable(selectedTable.id, (table) => ({
                          ...table,
                          layout: {
                            ...table.layout,
                            rotation: (table.layout.rotation + 45) % 360,
                          },
                        }));
                      }}
                      onToggleActive={(checked) => {
                        if (!selectedTable) return;
                        updateDraftTable(selectedTable.id, (table) => ({
                          ...table,
                          is_active: checked,
                        }));
                      }}
                      onConfigureTable={() => {
                        if (!selectedTable) return;
                        setEditingSeatingTableId(selectedTable.id);
                        setTableConfigDialogOpen(true);
                      }}
                      onDuplicate={() => {
                        if (!selectedTable) return;
                        duplicateTable(selectedTable.id);
                      }}
                      onRemove={() => {
                        if (!selectedTable) return;
                        removeDraftTable(selectedTable.id);
                      }}
                      onUpdateFurnitureWidth={(value) => {
                        if (!selectedTable) return;
                        updateDraftTableFootprint(selectedTable.id, value, selectedTable.layout.h);
                      }}
                      onUpdateFurnitureHeight={(value) => {
                        if (!selectedTable) return;
                        updateDraftTableFootprint(selectedTable.id, selectedTable.layout.w, value);
                      }}
                    />
                  </div>
                </div>

                <div className={cn("hidden min-h-0 xl:flex xl:flex-col", rightSidebarCollapsed && "xl:w-[92px]")}>
                  {rightSidebarCollapsed ? (
                    <div className="space-y-3">
                      <div className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] p-3 shadow-[0_24px_80px_-44px_rgba(15,23,42,0.4)]">
                        <div className="flex flex-col items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                            onClick={() => setRightSidebarCollapsed(false)}
                            title="Ouvrir l'inspecteur"
                          >
                            <PanelRightOpen className="h-4 w-4 text-slate-700" />
                          </Button>
                          <div className="h-px w-full bg-slate-200" />
                          <div className="rounded-[20px] border border-slate-200 bg-white px-3 py-4 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Selection</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {selectedTable ? selectedTable.table_number : "Aucune"}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {selectedTable ? getFloorPlanItemTypeLabel(selectedTable.layout.kind, selectedTable.layout.shape) : "Touchez un element"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 rounded-2xl border-slate-200 bg-white px-3 shadow-sm"
                          onClick={() => setRightSidebarCollapsed(true)}
                        >
                          <PanelRightClose className="h-4 w-4 text-slate-600" />
                          <span className="ml-2">Replier l'inspecteur</span>
                        </Button>
                      </div>
                      <StudioInspector
                        selectedTable={selectedTable}
                        selectedTableIsReservable={selectedTableIsReservable}
                        selectedTableDimensions={selectedTableDimensions}
                        sectorOptions={sectorOptions}
                        onRename={(value) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({
                            ...table,
                            table_number: value,
                          }));
                        }}
                        onSectorChange={(value) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({
                            ...table,
                            sector: value,
                          }));
                        }}
                        onRotationChange={(value) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({
                            ...table,
                            layout: { ...table.layout, rotation: value },
                          }));
                        }}
                        onRotateIncrement={() => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({
                            ...table,
                            layout: {
                              ...table.layout,
                              rotation: (table.layout.rotation + 45) % 360,
                            },
                          }));
                        }}
                        onToggleActive={(checked) => {
                          if (!selectedTable) return;
                          updateDraftTable(selectedTable.id, (table) => ({
                            ...table,
                            is_active: checked,
                          }));
                        }}
                        onConfigureTable={() => {
                          if (!selectedTable) return;
                          setEditingSeatingTableId(selectedTable.id);
                          setTableConfigDialogOpen(true);
                        }}
                        onDuplicate={() => {
                          if (!selectedTable) return;
                          duplicateTable(selectedTable.id);
                        }}
                        onRemove={() => {
                          if (!selectedTable) return;
                          removeDraftTable(selectedTable.id);
                        }}
                        onUpdateFurnitureWidth={(value) => {
                          if (!selectedTable) return;
                          updateDraftTableFootprint(selectedTable.id, value, selectedTable.layout.h);
                        }}
                        onUpdateFurnitureHeight={(value) => {
                          if (!selectedTable) return;
                          updateDraftTableFootprint(selectedTable.id, selectedTable.layout.w, value);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                <ServiceBoard
                  selectedSector={selectedSector}
                  subtitle={`${formatDashboardDateHeading(referenceDate)} · ${filteredReservations.length} reservation(s) visibles`}
                  activeReservationLabel={activeServiceReservation ? getReservationCustomerLabel(activeServiceReservation) : null}
                  canvasWidth={canvasWidth}
                  canvasZoom={canvasZoom}
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
                  onCanvasWheel={handleCanvasWheel}
                  onCanvasDragOver={handleCanvasDragOver}
                  onCanvasDrop={handleCanvasDrop}
                  onCanvasDragLeave={handleCanvasDragLeave}
                  onCanvasBackgroundPress={clearServiceSelection}
                  onStartDraggingTable={startDraggingTable}
                  onStartResizingTable={(event, tableId) => startResizingTable(event, tableId, PRIMARY_RESIZE_HANDLE.key)}
                  onStartRotatingTable={startRotatingTable}
                  onUpdateCanvasZoom={updateCanvasZoom}
                  getReservationDropState={getReservationDropState}
                  getRenderedFrame={(table) => getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT)}
                  getTableContentPadding={getTableContentPadding}
                />

                <ReservationQueue
                  reservationQuery={reservationQuery}
                  reservationsLoading={reservationsLoading}
                  selectedReservationId={selectedReservationId}
                  selectedTable={selectedTableIsReservable ? selectedTable : null}
                  draggedReservationId={draggedReservationId}
                  unassignedReservations={unassignedVisibleReservations}
                  assignedReservations={assignedVisibleReservations}
                  draftAssignments={draftAssignments}
                  tableMap={tableMap}
                  onReservationQueryChange={setReservationQuery}
                  onReservationPress={handleServiceReservationPress}
                  onReservationDragStart={handleReservationDragStart}
                  onReservationDragEnd={handleReservationDragEnd}
                  onReservationHandlePointerDown={handleReservationHandlePointerDown}
                  onReleaseReservation={clearReservationAssignment}
                  getReservationDropState={getReservationDropState}
                />
              </div>
            )}
          </div>
        ) : null}
      </div>
      {pointerDraggedReservation && reservationPointerPosition ? (
        <div
          className="pointer-events-none fixed z-[120] hidden max-w-[240px] -translate-y-1/2 rounded-full border border-amber-200 bg-white/96 px-4 py-2 shadow-[0_18px_55px_-28px_rgba(15,23,42,0.45)] sm:flex"
          style={{
            left: reservationPointerPosition.clientX + 18,
            top: reservationPointerPosition.clientY - 18,
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <Grip className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{getReservationCustomerLabel(pointerDraggedReservation)}</p>
              <p className="text-xs text-slate-500">Déposer sur une table</p>
            </div>
          </div>
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
        onOpenChange={(open) => {
          if (!open) {
            clearServiceSelection();
          }
        }}
        onClearSelection={clearServiceSelection}
        onAssignReservationToTable={assignReservationToTable}
        onReleaseReservation={clearReservationAssignment}
        onSelectReservation={(reservationId) => {
          setSelectedReservationId(reservationId);
          const assignedTableId = draftAssignments[reservationId];
          if (assignedTableId) {
            setSelectedTableId(assignedTableId);
          }
        }}
        onSelectTable={setSelectedTableId}
      />
      <Sheet open={leftSheetOpen && isTemplateMode} onOpenChange={setLeftSheetOpen}>
        <SheetContent side="left" className="flex w-[92vw] flex-col gap-0 overflow-hidden border-r border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(244,246,251,0.98))] p-0 sm:max-w-[430px]">
          <SheetHeader className="border-b border-slate-200 px-6 py-5">
            <SheetTitle>Palette studio</SheetTitle>
            <SheetDescription>
              Ajoutez tables et mobilier sans quitter le canevas. Les r?glages d?taill?s restent dans l'inspecteur.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <StudioPalette
              selectedId={selectedId}
              selectedSector={selectedSector}
              sectorOptions={sectorOptions}
              libraryTab={libraryTab}
              libraryQuery={libraryQuery}
              draftTables={draftTables}
              tablesLoading={tablesLoading}
              newSectorName={newSectorName}
              onLibraryTabChange={setLibraryTab}
              onLibraryQueryChange={setLibraryQuery}
              onPresetClick={(presetId) => {
                addTableFromPreset(presetId);
                setLeftSheetOpen(false);
              }}
              onSectorSelect={setSelectedSector}
              onNewSectorNameChange={setNewSectorName}
              onAddSector={addSector}
              onApplyAILayout={(layout) => {
                applyAILayout(layout);
                setLeftSheetOpen(false);
              }}
              presetsByTab={filteredLibraryPresets}
            />
          </div>
        </SheetContent>
      </Sheet>
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
          const t = draftTables.find((d) => d.id === editingSeatingTableId);
          if (!t) return null;
          const resolved = getResolvedFloorPlanDimensions({
            capacity: t.capacity,
            shape: t.layout.shape,
            kind: t.layout.kind,
            seatType: t.layout.seatType,
            seatPlacements: t.layout.seatPlacements,
            cornerBenchCorners: t.layout.cornerBenchCorners,
            cornerBenchConfigs: t.layout.cornerBenchConfigs,
            tableWidth: t.layout.tableWidth,
            tableHeight: t.layout.tableHeight,
            footprintWidth: t.layout.w,
            footprintHeight: t.layout.h,
            cornerBenchHorizontal: t.layout.cornerBenchHorizontal,
            cornerBenchVertical: t.layout.cornerBenchVertical,
            cornerBenchDepth: t.layout.cornerBenchDepth,
          });
          return {
            capacity: t.capacity,
            shape: t.layout.shape,
            seatType: (t.layout.seatType || "chair") as FloorPlanSeatType,
            seatPlacements: resolved.seatPlacements,
            cornerBenchConfigs: resolved.cornerBenchConfigs,
            tableWidth: resolved.tableWidth,
            tableHeight: resolved.tableHeight,
          };
        })() : null}
        preset={pendingPresetId ? FLOOR_PLAN_PRESETS.find((p) => p.id === pendingPresetId) || null : null}
        onConfirm={confirmTableConfig}
      />
    </DashboardLayout>
  );
}
