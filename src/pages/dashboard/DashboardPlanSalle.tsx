import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import TableConfigDialog from "@/components/floor-plan/TableConfigDialog";
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
import { supabase } from "@/integrations/supabase/client";
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
  const [libraryTab, setLibraryTab] = useState<"elements" | "structure" | "decoration">("elements");
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
  const normalizedReservationQuery = normalizeSearchText(reservationQuery);

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

  const selectedReservation = selectedReservationId ? reservationsById.get(selectedReservationId) || null : null;
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
  const presetGroups = useMemo(() => ([
    {
      id: "tables",
      label: "Tables reservables",
      description: "Ces elements peuvent recevoir des reservations.",
      items: FLOOR_PLAN_PRESETS.filter((preset) => preset.category === "table"),
    },
    {
      id: "furniture",
      label: "Mobilier",
      description: "Elements decoratifs et structurels pour coller a la vraie salle.",
      items: FLOOR_PLAN_PRESETS.filter((preset) => preset.category === "furniture"),
    },
  ]), []);
  const libraryPresets = useMemo(() => ({
    elements: FLOOR_PLAN_PRESETS.filter((preset) => preset.category === "table"),
    structure: FLOOR_PLAN_PRESETS.filter((preset) => [
      "bar",
      "corner-bench",
      "banquette",
      "booth",
      "host-stand",
      "divider",
      "service-station",
    ].includes(preset.kind)),
    decoration: FLOOR_PLAN_PRESETS.filter((preset) => ["chair", "stool", "plant"].includes(preset.kind)),
  }), []);

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
  const canPersist = !!selectedBranchId && (isTemplateMode || !hasUnpersistedDraftTables);
  const canvasZoomLabel = `${Math.round(canvasZoom * 100)}%`;

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

  const getReservationDropState = (reservationId: string, tableId: string) => {
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

    setDraftAssignments((current) => ({
      ...current,
      [reservationId]: tableId,
    }));
    setSelectedReservationId(reservationId);
    setSelectedTableId(tableId);
  };

  const handleReservationDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    reservationId: string,
  ) => {
    setDraggedReservationId(reservationId);
    setSelectedReservationId(reservationId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-reservation-id", reservationId);
    event.dataTransfer.setData("text/plain", reservationId);
  };

  const handleReservationDragEnd = () => {
    setDraggedReservationId(null);
    setDragOverTableId(null);
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
                  {selectedBranch ? (
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
                  {selectedBranch ? (
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
                  {selectedBranch ? (
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
                  {selectedBranch ? (
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
            <div className="grid gap-3 rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,246,251,0.96))] p-4 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.35)] md:grid-cols-2 xl:grid-cols-7">
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
            </div>

            {showWorkspaceStats ? (
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

            <div className={cn(
              "grid min-h-0 flex-1 gap-5 transition-[grid-template-columns] duration-300 lg:grid-cols-[minmax(0,1fr)_320px]",
              leftSidebarCollapsed
                ? rightSidebarCollapsed
                  ? "xl:grid-cols-[92px_minmax(0,1fr)_92px]"
                  : "xl:grid-cols-[92px_minmax(0,1fr)_320px]"
                : rightSidebarCollapsed
                  ? "xl:grid-cols-[320px_minmax(0,1fr)_92px]"
                  : "xl:grid-cols-[320px_minmax(0,1fr)_320px]",
            )}>
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
                          title="Ouvrir le menu"
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
                            setLeftPanelView("library");
                            setLibraryTab("elements");
                            setLeftSidebarCollapsed(false);
                          }}
                          title="Ouvrir les elements"
                        >
                          <LayoutPanelTop className="h-4 w-4 text-slate-700" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                          onClick={() => {
                            setLeftPanelView("library");
                            setLibraryTab("structure");
                            setLeftSidebarCollapsed(false);
                          }}
                          title="Ouvrir la structure"
                        >
                          <Armchair className="h-4 w-4 text-slate-700" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 rounded-2xl border-slate-200 bg-white shadow-sm"
                          onClick={() => {
                            setLeftPanelView("reservations");
                            setLeftSidebarCollapsed(false);
                          }}
                          title="Ouvrir les reservations"
                        >
                          <CalendarClock className="h-4 w-4 text-slate-700" />
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] px-3 py-4 text-center shadow-[0_24px_80px_-44px_rgba(15,23,42,0.3)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Resa</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{unassignedVisibleReservations.length}</p>
                      <p className="mt-1 text-[11px] text-slate-500">sans table</p>
                    </div>
                  </div>
                ) : (
                  <>
                <div className="mb-4 grid shrink-0 grid-cols-2 gap-2 rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] p-2 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.35)]">
                  <Button
                    type="button"
                    variant={leftPanelView === "library" ? "default" : "ghost"}
                    className="h-11 rounded-2xl"
                    onClick={() => setLeftPanelView("library")}
                  >
                    <LayoutPanelTop className="mr-2 h-4 w-4" />
                    Bibliotheque
                  </Button>
                  <Button
                    type="button"
                    variant={leftPanelView === "reservations" ? "default" : "ghost"}
                    className="h-11 rounded-2xl"
                    onClick={() => setLeftPanelView("reservations")}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Reservations
                  </Button>
                </div>
                {leftPanelView === "library" ? (
                <Card className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] shadow-[0_24px_80px_-44px_rgba(15,23,42,0.4)]", !isTemplateMode && "border-dashed")}>
                  <CardHeader className="border-b border-slate-200/80 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg text-slate-900">Bibliotheque d'elements</CardTitle>
                        <CardDescription className="mt-1 text-slate-500">
                          Palette de conception optimisee pour un usage tactile rapide.
                        </CardDescription>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                          {isTemplateMode ? "Edition" : "Lecture"}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-2xl text-slate-600 hover:bg-white"
                          onClick={() => setLeftSidebarCollapsed(true)}
                          title="Replier le panneau"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                    {!isTemplateMode ? (
                      <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                        Passez en mode structure pour ajouter ou supprimer des elements.
                      </div>
                    ) : null}
                    <ScrollArea className="min-h-0 flex-1 pr-3">
                    <div className="space-y-4">
                    <PanelSection
                      open={panelSections.libraryCatalog}
                      onOpenChange={(open) => setPanelSectionOpen("libraryCatalog", open)}
                      title="Palette"
                      description="Choisissez la famille d'elements puis ajoutez-les sans encombrer la colonne."
                    >
                      <Tabs value={libraryTab} onValueChange={(value) => setLibraryTab(value as "elements" | "structure" | "decoration")}>
                        <TabsList className={`${SIDE_PANEL_TAB_LIST_CLASS} grid-cols-3`}>
                          <TabsTrigger value="elements" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Elements</TabsTrigger>
                          <TabsTrigger value="structure" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Structure</TabsTrigger>
                          <TabsTrigger value="decoration" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Decoration</TabsTrigger>
                        </TabsList>

                        <TabsContent value="elements" className="mt-4 space-y-3">
                          <div className={SIDE_PANEL_PRESET_GRID_CLASS}>
                            {libraryPresets.elements.map((preset) => (
                              <PalettePresetButton
                                key={preset.id}
                                preset={preset}
                                onClick={() => addTableFromPreset(preset.id)}
                                disabled={tablesLoading || !isTemplateMode}
                              />
                            ))}
                          </div>
                        </TabsContent>

                        <TabsContent value="structure" className="mt-4 space-y-3">
                          <div className={SIDE_PANEL_PRESET_GRID_CLASS}>
                            {libraryPresets.structure.map((preset) => (
                              <PalettePresetButton
                                key={preset.id}
                                preset={preset}
                                onClick={() => addTableFromPreset(preset.id)}
                                disabled={tablesLoading || !isTemplateMode}
                              />
                            ))}
                          </div>
                        </TabsContent>

                        <TabsContent value="decoration" className="mt-4 space-y-3">
                          <div className={SIDE_PANEL_PRESET_GRID_CLASS}>
                            {libraryPresets.decoration.map((preset) => (
                              <PalettePresetButton
                                key={preset.id}
                                preset={preset}
                                onClick={() => addTableFromPreset(preset.id)}
                                disabled={tablesLoading || !isTemplateMode}
                              />
                            ))}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </PanelSection>

                    <PanelSection
                      open={panelSections.librarySectors}
                      onOpenChange={(open) => setPanelSectionOpen("librarySectors", open)}
                      title="Secteurs"
                      description="Creez rapidement des zones de service sans surcharger le panneau."
                    >
                      <div className="space-y-3">
                        <Label htmlFor="new-sector" className="text-xs uppercase tracking-[0.18em] text-slate-500">Nouveau secteur</Label>
                        <div className="flex gap-2">
                          <Input
                            id="new-sector"
                            value={newSectorName}
                            placeholder="Terrasse, Salon VIP..."
                            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                            disabled={!isTemplateMode}
                            onChange={(event) => setNewSectorName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addSector();
                              }
                            }}
                          />
                          <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white" onClick={addSector} disabled={!isTemplateMode}>
                            <Plus className="mr-2 h-4 w-4" />
                            Ajouter
                          </Button>
                        </div>
                      </div>
                    </PanelSection>

                    {selectedId ? (
                      <PanelSection
                        open={panelSections.libraryAI}
                        onOpenChange={(open) => setPanelSectionOpen("libraryAI", open)}
                        title="Assistant IA"
                        description="Utilisez-le uniquement quand vous avez besoin d'un point de depart plus global."
                        contentClassName="p-1"
                      >
                        <FloorPlanAIPanel
                          restaurantId={selectedId}
                          currentLayout={draftTables.map((t) => ({
                            table_number: t.table_number,
                            capacity: t.capacity,
                            layout: { x: t.layout.x, y: t.layout.y, w: t.layout.w, h: t.layout.h, shape: t.layout.shape, kind: t.layout.kind },
                          }))}
                          canvasWidth={CANVAS_WIDTH}
                          canvasHeight={CANVAS_HEIGHT}
                          onApply={applyAILayout}
                          disabled={!isTemplateMode}
                        />
                      </PanelSection>
                    ) : null}
                    </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
                ) : null}

                {leftPanelView === "reservations" ? (
                <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] shadow-[0_24px_80px_-44px_rgba(15,23,42,0.4)]">
                  <CardHeader className="border-b border-slate-200/80 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg text-slate-900">Reservations a placer</CardTitle>
                        <CardDescription className="mt-1 text-slate-500">
                          Glissez une reservation sur une table ou utilisez l'inspecteur pour l'affecter.
                        </CardDescription>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                          {filteredReservations.length}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-2xl text-slate-600 hover:bg-white"
                          onClick={() => setLeftSidebarCollapsed(true)}
                          title="Replier le panneau"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1 p-4">
                    <div className="flex h-full min-h-0 flex-col gap-4">
                      <PanelSection
                        open={panelSections.reservationSearch}
                        onOpenChange={(open) => setPanelSectionOpen("reservationSearch", open)}
                        title="Recherche"
                        description="Filtrez rapidement la file des reservations."
                      >
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            value={reservationQuery}
                            onChange={(event) => setReservationQuery(event.target.value)}
                            placeholder="Rechercher un nom, numero, service..."
                            className="h-11 rounded-2xl border-slate-200 bg-white pl-9"
                          />
                        </div>
                      </PanelSection>

                      <PanelSection
                        open={panelSections.reservationList}
                        onOpenChange={(open) => setPanelSectionOpen("reservationList", open)}
                        title="Liste"
                        description="Reservations visibles pour la date, le service et les filtres actifs."
                        badge={<Badge variant="outline" className="rounded-full bg-white">{unassignedVisibleReservations.length} sans table</Badge>}
                        className="flex min-h-0 flex-1 flex-col"
                        contentClassName="min-h-0 flex-1 p-0"
                      >
                        <ScrollArea className="h-full">
                          <div className="space-y-3 p-4">
                        {reservationsLoading ? (
                          <p className="text-sm text-muted-foreground">Chargement des reservations...</p>
                        ) : null}

                        {filteredReservations.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Aucune reservation pour les filtres selectionnes.</p>
                        ) : null}

                        {filteredReservations.map((reservation) => {
                          const assignedTableId = draftAssignments[reservation.id];
                          const assignedTable = assignedTableId ? tableMap.get(assignedTableId) || null : null;
                          const isSelected = reservation.id === selectedReservationId;
                          const reservationService = getReservationService(reservation);
                          const isZeroAttente = isZeroAttenteReservation(reservation);
                          const preorderItems = getReservationPreorderItems(reservation);

                          return (
                            <div
                              key={reservation.id}
                              role="button"
                              tabIndex={0}
                              draggable
                              onClick={() => {
                                setSelectedReservationId(reservation.id);
                                if (assignedTableId) {
                                  setSelectedTableId(assignedTableId);
                                }
                              }}
                              onDragStart={(event) => handleReservationDragStart(event, reservation.id)}
                              onDragEnd={handleReservationDragEnd}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedReservationId(reservation.id);
                                  if (assignedTableId) {
                                    setSelectedTableId(assignedTableId);
                                  }
                                }
                              }}
                              className={cn(
                                "w-full cursor-grab rounded-2xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 active:cursor-grabbing",
                                isSelected && isZeroAttente && "border-teal-500 bg-teal-50 shadow-sm ring-2 ring-teal-200",
                                isSelected && !isZeroAttente && "border-primary bg-primary/5 shadow-sm",
                                !isSelected && isZeroAttente && "border-teal-200 bg-teal-50/60 hover:bg-teal-50",
                                !isSelected && !isZeroAttente && "border-border bg-background hover:bg-muted/40",
                                draggedReservationId === reservation.id && "scale-[0.99] opacity-60",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold">{getReservationCustomerLabel(reservation)}</span>
                                    {isZeroAttente ? (
                                      <Badge className="border border-teal-200 bg-teal-100 text-teal-800">
                                        Zero Attente
                                      </Badge>
                                    ) : null}
                                    <Badge className={cn("border", getReservationStatusTone(reservation.status))}>
                                      {reservation.status || "pending"}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      {getSafeTime(reservation.time)}
                                    </span>
                                    <span>{getShortDateLabel(reservation.date)}</span>
                                    <span>{reservation.party_size} pers.</span>
                                    <span>{getServicePeriodLabel(reservationService)}</span>
                                    {preorderItems.length > 0 ? (
                                      <span>{preorderItems.length} produit(s)</span>
                                    ) : null}
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                                      <Grip className="h-3 w-3" />
                                      Drag & drop
                                    </span>
                                  </div>
                                  {assignedTable ? (
                                    <Badge variant="outline" className="bg-background">
                                      Affectee a {assignedTable.table_number}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-background text-amber-700 border-amber-200">
                                      Sans table
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2">
                                  {assignedTableId ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setDraftAssignments((current) => ({ ...current, [reservation.id]: null }));
                                      }}
                                    >
                                      Liberer
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                          </div>
                        </ScrollArea>
                      </PanelSection>
                    </div>
                  </CardContent>
                </Card>
                ) : null}
                  </>
                )}
              </div>

              <div className="min-w-0 min-h-0 flex flex-col gap-4">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,246,251,0.97))] shadow-[0_36px_110px_-48px_rgba(15,23,42,0.42)]">
                <CardHeader className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,252,0.88))] pb-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-[1.4rem] text-slate-900">{selectedSector}</CardTitle>
                      <CardDescription className="mt-1 text-slate-500">
                        {isTemplateMode
                          ? "Template global applique par defaut chaque jour"
                          : `${formatDashboardDateHeading(referenceDate)} - ${filteredReservations.length} reservation(s) visibles`}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                        {isTemplateMode
                          ? "Template global - drag pour repositionner et redimensionner"
                          : "Plan du jour - drag pour ajuster uniquement cette date"}
                      </Badge>
                      {!isTemplateMode ? (
                        <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
                          Sauvegarde auto active
                        </Badge>
                      ) : null}
                      <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-1 py-1 shadow-sm">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl"
                          onClick={() => updateCanvasZoom(canvasZoom - CANVAS_ZOOM_STEP)}
                          disabled={canvasZoom <= MIN_CANVAS_ZOOM}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="min-w-14 text-center text-sm font-semibold">{canvasZoomLabel}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl"
                          onClick={() => updateCanvasZoom(1)}
                          disabled={canvasZoom === 1}
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl"
                          onClick={() => updateCanvasZoom(canvasZoom + CANVAS_ZOOM_STEP)}
                          disabled={canvasZoom >= MAX_CANVAS_ZOOM}
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(251,252,254,1),rgba(243,245,249,1))] p-4">
                    <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-slate-200/80 bg-white/70 p-3 shadow-inner">
                      <div className="flex items-center justify-between pl-16 pr-5 text-[11px] font-medium text-slate-500">
                        {Array.from({ length: 9 }, (_, index) => (
                          <span key={`ruler-x-${index}`}>{index * 2}</span>
                        ))}
                      </div>
                      <div className="mt-2 flex min-h-0 flex-1 gap-3">
                        <div className="flex w-10 shrink-0 flex-col justify-between py-4 text-[11px] font-medium text-slate-500">
                          {Array.from({ length: 7 }, (_, index) => (
                            <span key={`ruler-y-${index}`}>{index * 2}</span>
                          ))}
                        </div>
                        <div ref={canvasViewportRef} className="min-w-0 min-h-0 flex-1">
                          <ScrollArea className="h-full w-full">
                      <div
                        ref={canvasRef}
                        className="relative overflow-hidden rounded-[28px] border border-slate-300/70 shadow-inner"
                        onWheelCapture={handleCanvasWheel}
                        onDragOver={handleCanvasDragOver}
                        onDrop={handleCanvasDrop}
                        onDragLeave={handleCanvasDragLeave}
                        style={{
                          width: canvasWidth,
                          height: CANVAS_HEIGHT,
                          backgroundImage: "linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)",
                          backgroundSize: "32px 32px, 32px 32px",
                          backgroundColor: "#f7f8fb",
                        }}
                      >
                        <div
                          className="relative h-full w-full overflow-hidden"
                          style={{
                            width: canvasWidth,
                            height: CANVAS_HEIGHT,
                          }}
                        >
                          <div className="pointer-events-none absolute inset-[26px] rounded-[34px] border-[14px] border-[#34353a] bg-[linear-gradient(180deg,rgba(201,160,116,0.96),rgba(184,145,104,0.94))] shadow-[0_30px_70px_-35px_rgba(15,23,42,0.55)]" />
                          <div className="pointer-events-none absolute inset-[44px] rounded-[20px] bg-[linear-gradient(135deg,rgba(221,188,146,0.94),rgba(189,149,108,0.95))]" />
                          {visibleTables.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                              <LayoutPanelTop className="h-10 w-10 text-primary/60" />
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">Aucun element dans ce secteur</p>
                                <p className="text-sm">Ajoutez une table ou du mobilier depuis la palette de gauche pour commencer.</p>
                              </div>
                            </div>
                          ) : null}

                          {visibleTables.map((table) => {
                            const assignments = visibleAssignmentsByTable.get(table.id) || [];
                            const primaryAssignment = assignments[0] || null;
                            const isReservable = isReservableDraftTable(table);
                            const isSelected = table.id === selectedTableId;
                            const isZeroAttentePrimary = primaryAssignment ? isZeroAttenteReservation(primaryAssignment) : false;
                            const activeDraggedReservationId = draggedReservationId;
                            const dropState = activeDraggedReservationId && isReservable
                              ? getReservationDropState(activeDraggedReservationId, table.id)
                              : null;
                            const isDragTarget = isReservable && dragOverTableId === table.id && !!activeDraggedReservationId;
                            const canDropHere = !!dropState?.ok;
                            const renderedFrame = getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT);
                            const density = getTableDensity(renderedFrame);
                            const isTight = density === "tight";
                            const contentPadding = isReservable
                              ? getTableContentPadding(table.layout, table.capacity, canvasZoom)
                              : { top: 0, right: 0, bottom: 0, left: 0 };
                            const coverLabel = density === "regular" ? `${table.capacity} couv.` : `${table.capacity}`;
                            const reservationCustomerLabel = primaryAssignment
                              ? getCompactReservationCustomerLabel(primaryAssignment, density)
                              : null;
                            const reservationDetailLabel = primaryAssignment
                              ? density === "tight"
                                ? `${primaryAssignment.party_size}p`
                                : `${primaryAssignment.party_size} pers.`
                              : null;

                            return (
                              <div
                                key={table.id}
                                className="absolute select-none focus:outline-none"
                                style={{
                                  left: renderedFrame.x,
                                  top: renderedFrame.y,
                                  width: renderedFrame.w,
                                  height: renderedFrame.h,
                                  zIndex: isSelected ? 40 : isReservable && assignments.length > 0 ? 24 : 12,
                                  cursor: dragState?.tableId === table.id ? "grabbing" : "grab",
                                }}
                                onPointerDown={(event) => {
                                  if ((event.target as HTMLElement).closest("[data-rotate-handle]") || (event.target as HTMLElement).closest("[data-resize-handle]")) return;
                                  startDraggingTable(event, table.id);
                                }}
                                onClick={() => setSelectedTableId(table.id)}
                              >
                                {/* Rotated wrapper */}
                                <div
                                  className="relative h-full w-full"
                                  style={{
                                    transform: `rotate(${table.layout.rotation}deg)`,
                                    transformOrigin: "center center",
                                  }}
                                >
                                  {/* SVG illustration — no background block for furniture */}
                                  <div className="absolute inset-0">
                                    <FloorPlanItemIllustration
                                      kind={table.layout.kind}
                                      shape={table.layout.shape}
                                      capacity={table.capacity}
                                      seatType={table.layout.seatType}
                                      seatPlacements={table.layout.seatPlacements}
                                      cornerBenchCorners={table.layout.cornerBenchCorners}
                                      cornerBenchConfigs={table.layout.cornerBenchConfigs}
                                      tableWidth={table.layout.tableWidth}
                                      tableHeight={table.layout.tableHeight}
                                      cornerBenchHorizontal={table.layout.cornerBenchHorizontal}
                                      cornerBenchVertical={table.layout.cornerBenchVertical}
                                      cornerBenchDepth={table.layout.cornerBenchDepth}
                                      className="h-full w-full"
                                    />
                                  </div>

                                  {/* Selection ring */}
                                  {isSelected && (
                                    <div className="pointer-events-none absolute inset-[-2px] rounded-lg border-2 border-primary/50" />
                                  )}

                                  {/* Drop target feedback */}
                                  {isDragTarget && (
                                    <div className={cn(
                                      "pointer-events-none absolute inset-[-2px] rounded-lg border-2",
                                      canDropHere ? "border-emerald-500 bg-emerald-50/30" : "border-rose-500 bg-rose-50/30",
                                    )} />
                                  )}

                                  {/* ── TABLE OVERLAY (name + reservation info) ── */}
                                  {isReservable && (
                                    <div
                                      className="absolute inset-0 flex flex-col overflow-hidden"
                                      style={{
                                        paddingTop: contentPadding.top,
                                        paddingRight: contentPadding.right,
                                        paddingBottom: contentPadding.bottom,
                                        paddingLeft: contentPadding.left,
                                      }}
                                    >
                                      {/* Table name + capacity */}
                                      <div className="flex items-start justify-between gap-1">
                                        <div className="min-w-0">
                                          <p className={cn(
                                            "break-words font-bold text-foreground drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]",
                                            density === "regular" ? "text-sm" : density === "compact" ? "text-[10px]" : "text-[8px]",
                                          )}>
                                            {table.table_number}
                                          </p>
                                          {!isTight && (
                                            <p className={cn(
                                              "uppercase text-muted-foreground drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]",
                                              density === "regular" ? "text-[9px] tracking-[0.14em]" : "text-[7px] tracking-[0.1em]",
                                            )}>
                                              {coverLabel}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      {/* Reservation card */}
                                      <div className={cn(
                                        "flex min-h-0 flex-1 flex-col items-center justify-center",
                                        density === "regular" ? "gap-1.5" : "gap-0.5",
                                      )}>
                                        {primaryAssignment ? (
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedReservationId(primaryAssignment.id);
                                              setSelectedTableId(table.id);
                                            }}
                                            className={cn(
                                              "max-w-full border text-left shadow-sm backdrop-blur-sm transition-colors",
                                              isZeroAttentePrimary
                                                ? "border-teal-200 bg-teal-50/90 hover:bg-teal-100/90"
                                                : "border-[#ebd4bb] bg-white/90 hover:bg-white",
                                              density === "regular"
                                                ? "rounded-xl px-2.5 py-1.5"
                                                : density === "compact"
                                                  ? "rounded-lg px-1.5 py-1"
                                                  : "rounded-md px-1 py-0.5",
                                            )}
                                          >
                                            <p className={cn(
                                              "truncate font-semibold text-foreground",
                                              density === "regular" ? "text-[11px]" : density === "compact" ? "text-[9px]" : "text-[7px]",
                                            )}>
                                              {reservationCustomerLabel}
                                            </p>
                                            <div className="flex items-center gap-1">
                                              <span className={cn(
                                                "font-medium text-muted-foreground",
                                                density === "regular" ? "text-[10px]" : "text-[7px]",
                                              )}>
                                                {getSafeTime(primaryAssignment.time)} {reservationDetailLabel}
                                              </span>
                                            </div>
                                          </button>
                                        ) : null}
                                        {assignments.length > 1 && !isTight ? (
                                          <span className={cn(
                                            "font-medium text-muted-foreground drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]",
                                            density === "regular" ? "text-[10px]" : "text-[8px]",
                                          )}>
                                            +{assignments.length - 1}
                                          </span>
                                        ) : null}
                                      </div>

                                      {/* Drop feedback */}
                                      {isDragTarget && activeDraggedReservationId ? (
                                        <div className={cn(
                                          "absolute bottom-1 left-1 right-1 rounded-lg border px-2 py-1 text-center text-[9px] font-semibold backdrop-blur-sm",
                                          canDropHere
                                            ? "border-emerald-200 bg-emerald-100/90 text-emerald-800"
                                            : "border-rose-200 bg-rose-100/90 text-rose-800",
                                        )}>
                                          {canDropHere ? "Affecter" : dropState?.reason}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}

                                  {/* Resize handle (bottom-right, selected only) */}
                                  {isSelected && (
                                    <button
                                      type="button"
                                      data-resize-handle
                                      aria-label={`Redimensionner ${table.table_number}`}
                                      className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border border-primary/50 bg-white shadow-sm"
                                      style={{ cursor: "nwse-resize" }}
                                      onPointerDown={(event) => startResizingTable(event, table.id, PRIMARY_RESIZE_HANDLE.key)}
                                    />
                                  )}
                                </div>

                                {/* Rotate handle — outside the rotated wrapper so it stays upright */}
                                {isSelected && (
                                  <div
                                    data-rotate-handle
                                    className="absolute flex items-center justify-center"
                                    style={{
                                      top: -28,
                                      left: "50%",
                                      transform: "translateX(-50%)",
                                      cursor: "grab",
                                    }}
                                    onPointerDown={(event) => startRotatingTable(event, table.id)}
                                  >
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/50 bg-white shadow-md">
                                      <RotateCw className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    {/* Connecting line from handle to element */}
                                    <div className="absolute top-6 h-2 w-px bg-primary/30" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                          </ScrollArea>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2 text-xs text-slate-500 shadow-sm">
                  Maintenez Ctrl pour zoomer, glissez un element pour le deplacer, utilisez la molette pour affiner la vue.
                </div>
              </div>

              </div>

              {rightSidebarCollapsed ? (
                <div className="hidden min-h-0 xl:flex xl:flex-col">
                  <div className="flex h-full flex-col items-center gap-3 rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] p-3 shadow-[0_24px_80px_-44px_rgba(15,23,42,0.3)]">
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
                    <Button
                      type="button"
                      variant={inspectorTab === "properties" ? "default" : "outline"}
                      size="icon"
                      className="h-12 w-12 rounded-2xl"
                      onClick={() => {
                        setInspectorTab("properties");
                        setRightSidebarCollapsed(false);
                      }}
                      title="Proprietes"
                    >
                      <Armchair className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={inspectorTab === "layers" ? "default" : "outline"}
                      size="icon"
                      className="h-12 w-12 rounded-2xl"
                      onClick={() => {
                        setInspectorTab("layers");
                        setRightSidebarCollapsed(false);
                      }}
                      title="Calques"
                    >
                      <LayoutPanelTop className="h-4 w-4" />
                    </Button>
                    <div className="mt-auto w-full rounded-[22px] border border-slate-200 bg-white/85 px-3 py-4 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sel.</p>
                      <p className="mt-2 text-xl font-bold text-slate-900">{selectedTable ? 1 : 0}</p>
                      <p className="mt-1 text-[11px] text-slate-500">element</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={cn("hidden min-h-0 lg:flex lg:flex-col", rightSidebarCollapsed && "xl:hidden")}>
                <Card className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] shadow-[0_24px_80px_-44px_rgba(15,23,42,0.4)]">
                  <CardHeader className="border-b border-slate-200/80 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg text-slate-900">Inspecteur</CardTitle>
                        <CardDescription className="mt-1 text-slate-500">
                          {isTemplateMode
                            ? "Ajustez la structure du template ou finalisez le placement de la reservation active."
                            : "Ajustez le placement du jour ou finalisez le placement de la reservation active."}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-2xl text-slate-600 hover:bg-white"
                        onClick={() => setRightSidebarCollapsed(true)}
                        title="Replier le panneau"
                      >
                        <PanelRightClose className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1 overflow-hidden p-4">
                    <Tabs className="flex h-full min-h-0 flex-col" value={inspectorTab} onValueChange={(value) => setInspectorTab(value as "properties" | "layers")}>
                      <TabsList className={`${SIDE_PANEL_TAB_LIST_CLASS} grid-cols-2`}>
                        <TabsTrigger value="properties" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Proprietes</TabsTrigger>
                        <TabsTrigger value="layers" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Calques</TabsTrigger>
                      </TabsList>

                      <TabsContent value="properties" className="mt-4 min-h-0 flex-1">
                    <ScrollArea className="h-full pr-3">
                    <div className="space-y-4">
                    {selectedReservation ? (
                      <PanelSection
                        open={panelSections.inspectorReservation}
                        onOpenChange={(open) => setPanelSectionOpen("inspectorReservation", open)}
                        title="Reservation active"
                        description="Contexte client et affectation en cours."
                        badge={<Badge variant="outline" className="rounded-full bg-white">{selectedReservation.party_size} pers.</Badge>}
                        className={cn(
                          isZeroAttenteReservation(selectedReservation) ? "border-teal-200 bg-teal-50/60" : "bg-white/90",
                        )}
                      >
                        <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-full",
                            isZeroAttenteReservation(selectedReservation)
                              ? "bg-teal-100 text-teal-700"
                              : "bg-primary/10 text-primary",
                          )}>
                            <UserRound className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold">{getReservationCustomerLabel(selectedReservation)}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDashboardDateHeading(selectedReservation.date)} - {getSafeTime(selectedReservation.time)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline">{selectedReservation.party_size} pers.</Badge>
                          <Badge variant="outline">{getServicePeriodLabel(selectedReservationService)}</Badge>
                          {isZeroAttenteReservation(selectedReservation) ? (
                            <Badge className="border border-teal-200 bg-teal-100 text-teal-800">
                              Zero Attente
                            </Badge>
                          ) : null}
                          <Badge className={cn("border", getReservationStatusTone(selectedReservation.status))}>
                            {selectedReservation.status || "pending"}
                          </Badge>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedReservationAssignedTable ? (
                            <Badge variant="outline" className="bg-background">
                              Actuellement sur {selectedReservationAssignedTable.table_number}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-background text-amber-700 border-amber-200">
                              Pas encore placee
                            </Badge>
                          )}
                          {selectedTableIsReservable && selectedTable ? (
                            <Button
                              size="sm"
                              onClick={() => assignReservationToTable(selectedReservation.id, selectedTable.id)}
                            >
                              Affecter a {selectedTable.table_number}
                            </Button>
                          ) : null}
                          {selectedReservationAssignedTableId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDraftAssignments((current) => ({ ...current, [selectedReservation.id]: null }))}
                            >
                              Retirer de la table
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                          <div className="min-w-0 rounded-2xl border bg-background/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</p>
                            <div className="mt-2 space-y-2 text-sm">
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-muted-foreground">Nom</span>
                                <span className="min-w-0 break-words text-right font-medium">{getReservationCustomerLabel(selectedReservation)}</span>
                              </div>
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-muted-foreground">Telephone</span>
                                <span className="min-w-0 break-words text-right font-medium">{selectedReservation.customer?.phone || "Non renseigne"}</span>
                              </div>
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-muted-foreground">Convives</span>
                                <span className="text-right font-medium">{selectedReservation.party_size}</span>
                              </div>
                            </div>
                            {selectedReservationSpecialRequest ? (
                              <div className="mt-3 rounded-xl border border-dashed bg-muted/30 p-2.5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                                <p className="mt-1 break-words text-sm text-foreground">{selectedReservationSpecialRequest}</p>
                              </div>
                            ) : null}
                          </div>
                          <div className="min-w-0 rounded-2xl border bg-background/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paiement</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  selectedReservationPaymentDetails?.isPaid
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700",
                                )}
                              >
                                {selectedReservationPaymentDetails?.isPaid ? "Paye" : "A regler"}
                              </Badge>
                              {selectedReservationPaymentDetails?.paymentMethod ? (
                                <Badge variant="outline">{selectedReservationPaymentDetails.paymentMethod}</Badge>
                              ) : null}
                            </div>
                            <div className="mt-2 space-y-2 text-sm">
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-muted-foreground">Montant</span>
                                <span className="min-w-0 break-words text-right font-medium">
                                  {formatReservationCurrency(selectedReservationPaymentDetails?.totalAmount ?? null) || "Non renseigne"}
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-muted-foreground">Instrument</span>
                                <span className="min-w-0 break-words text-right font-medium">
                                  {selectedReservationPaymentDetails?.cardLabel || "Non renseigne"}
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-muted-foreground">Reference</span>
                                <span className="min-w-0 break-words text-right font-medium">
                                  {selectedReservationPaymentDetails?.orderReference
                                    || selectedReservationPaymentDetails?.checkoutSessionId
                                    || "Non renseignee"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {selectedReservationPreorderItems.length > 0 ? (
                          <div className="mt-4 rounded-2xl border bg-background/80 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Produits choisis</p>
                              <Badge variant="outline">
                                {selectedReservationPreorderItems.reduce((sum, item) => sum + item.quantity, 0)} article(s)
                              </Badge>
                            </div>
                            <div className="mt-3 space-y-2">
                              {selectedReservationPreorderItems.map((item, index) => (
                                <div key={`${item.menuItemId || item.name}-${index}`} className="rounded-xl border bg-muted/20 px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium">{item.name}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {item.quantity} x {formatReservationCurrency(item.unitPrice) || "Prix indisponible"}
                                      </p>
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold">
                                      {formatReservationCurrency(item.totalPrice) || "Prix indisponible"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        </div>
                      </PanelSection>
                    ) : (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        Selectionnez une reservation dans la colonne de gauche pour preparer son placement.
                      </div>
                    )}

                    {selectedTable ? (
                      <>
                      <PanelSection
                        open={panelSections.inspectorElement}
                        onOpenChange={(open) => setPanelSectionOpen("inspectorElement", open)}
                        title="Element selectionne"
                        description="Reglez le mobilier ou la table selectionnee."
                        badge={<Badge variant="outline" className="rounded-full bg-white">{getFloorPlanItemTypeLabel(selectedTable.layout.kind, selectedTable.layout.shape)}</Badge>}
                      >
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{selectedTable.sector}</p>
                          </div>
                        </div>

                        {!isTemplateMode ? (
                          <div className="rounded-2xl border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
                            Le plan du jour ne modifie que la position et la taille des elements. Pour changer durablement la structure de la salle, passez en mode template.
                          </div>
                        ) : null}

                        <div className="grid gap-3">
                          <div className="space-y-2">
                            <Label>Nom de l'element</Label>
                            <Input
                              value={selectedTable.table_number}
                              disabled={!isTemplateMode}
                              onChange={(event) => updateDraftTable(selectedTable.id, (table) => ({
                                ...table,
                                table_number: event.target.value,
                              }))}
                            />
                          </div>

                          {selectedTableIsReservable ? (
                            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
                              <div className="space-y-2">
                                <Label>Couverts configures</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={selectedTable.capacity}
                                  disabled
                                />
                                <p className="text-xs text-muted-foreground">
                                  La capacite suit le plan d'assises defini dans le configurateur.
                                </p>
                              </div>

                              <div className="space-y-2">
                                <Label>Forme</Label>
                                <Select
                                  value={selectedTable.layout.shape}
                                  disabled={!isTemplateMode}
                                  onValueChange={(value) => {
                                    const nextShape = value as FloorPlanTableShape;
                                    updateDraftTable(selectedTable.id, (table) => ({
                                      ...table,
                                      layout: ensureFloorPlanLayoutFitsCapacity(
                                        table.layout,
                                        table.capacity,
                                        nextShape,
                                        table.layout.kind,
                                      ),
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="min-w-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="rect">Rectangle</SelectItem>
                                    <SelectItem value="round">Ronde</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                              Ce mobilier structure visuellement la salle mais ne peut pas recevoir de reservation.
                            </div>
                          )}

                          {selectedTableIsReservable && selectedTableDimensions ? (
                            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Plateau</p>
                                <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                                  {selectedTableDimensions.tableWidth} x {selectedTableDimensions.tableHeight} cm
                                </p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Emprise</p>
                                <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                                  {selectedTableDimensions.footprintWidth} x {selectedTableDimensions.footprintHeight} cm
                                </p>
                              </div>
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <Label>Secteur</Label>
                            <Select
                              value={selectedTable.sector}
                              disabled={!isTemplateMode}
                              onValueChange={(value) => updateDraftTable(selectedTable.id, (table) => ({
                                ...table,
                                sector: value,
                              }))}
                            >
                              <SelectTrigger className="min-w-0">
                                <SelectValue />
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

                          <div className="space-y-2">
                            <Label>Rotation</Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={359}
                                step={15}
                                value={Math.round(selectedTable.layout.rotation)}
                                onChange={(event) => {
                                  const deg = Math.round(Number(event.target.value) || 0) % 360;
                                  updateDraftTable(selectedTable.id, (table) => ({
                                    ...table,
                                    layout: { ...table.layout, rotation: deg < 0 ? deg + 360 : deg },
                                  }));
                                }}
                                className="w-[88px] min-w-0"
                              />
                              <span className="text-xs text-muted-foreground">deg</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => {
                                  updateDraftTable(selectedTable.id, (table) => ({
                                    ...table,
                                    layout: { ...table.layout, rotation: (table.layout.rotation + 45) % 360 },
                                  }));
                                }}
                              >
                                <RotateCw className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">Element actif</p>
                              <p className="text-sm text-muted-foreground">Inactive = masque du plan et des placements.</p>
                            </div>
                            <Switch
                              checked={selectedTable.is_active}
                              disabled={!isTemplateMode}
                              onCheckedChange={(checked) => updateDraftTable(selectedTable.id, (table) => ({
                                ...table,
                                is_active: checked,
                              }))}
                            />
                          </div>

                          {selectedTableIsReservable && isTemplateMode ? (
                            <Button
                              variant="outline"
                              className="justify-start"
                              onClick={() => {
                                setEditingSeatingTableId(selectedTable.id);
                                setTableConfigDialogOpen(true);
                              }}
                            >
                              <Armchair className="mr-2 h-4 w-4" />
                              Configurer dimensions et assises
                            </Button>
                          ) : null}

                          {isTemplateMode ? (
                            <Button
                              variant="outline"
                              className="justify-start"
                              onClick={() => duplicateTable(selectedTable.id)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Dupliquer
                            </Button>
                          ) : null}

                          <Button
                            variant="outline"
                            className="justify-start text-destructive"
                            onClick={() => removeDraftTable(selectedTable.id)}
                            disabled={!isTemplateMode}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer l'element
                          </Button>
                        </div>
                      </div>
                      </PanelSection>
                        {selectedTableIsReservable ? (
                          <PanelSection
                            open={panelSections.inspectorPlanning}
                            onOpenChange={(open) => setPanelSectionOpen("inspectorPlanning", open)}
                            title="Planning sur cette table"
                            badge={<Badge variant="outline" className="rounded-full bg-white">{selectedTableAssignments.length}</Badge>}
                          >
                            {selectedTableAssignments.length > 0 ? (
                              <div className="space-y-2">
                                {selectedTableAssignments.map((reservation) => (
                                  <button
                                    key={reservation.id}
                                    type="button"
                                    className={cn(
                                      "w-full rounded-2xl border px-3 py-2 text-left transition-colors",
                                      isZeroAttenteReservation(reservation)
                                        ? "border-teal-200 bg-teal-50/70 hover:bg-teal-100/70"
                                        : "bg-muted/20 hover:bg-muted/35",
                                    )}
                                    onClick={() => {
                                      setSelectedReservationId(reservation.id);
                                      setSelectedTableId(selectedTable.id);
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium">{getReservationCustomerLabel(reservation)}</span>
                                      <span className="text-sm text-muted-foreground">{getSafeTime(reservation.time)}</span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      <span>{getShortDateLabel(reservation.date)}</span>
                                      <span>{reservation.party_size} pers.</span>
                                      {isZeroAttenteReservation(reservation) ? <span>Zero Attente</span> : null}
                                      <span>{reservation.status || "pending"}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Aucune reservation visible n'est actuellement affectee a cette table.</p>
                            )}
                          </PanelSection>
                        ) : null}
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        Selectionnez un element dans le plan pour modifier ses proprietes.
                      </div>
                    )}
                    </div>
                    </ScrollArea>
                      </TabsContent>

                      <TabsContent value="layers" className="mt-4 min-h-0 flex-1">
                        <ScrollArea className="h-full pr-3">
                        <div className="space-y-4">
                        <PanelSection
                          open={panelSections.layersElements}
                          onOpenChange={(open) => setPanelSectionOpen("layersElements", open)}
                          title="Elements visibles"
                          description="Liste compacte des elements actifs du secteur."
                        >
                          <div className="space-y-2">
                            {layerItems.length > 0 ? (
                              layerItems.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={cn(
                                    "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition-colors",
                                    selectedTableId === item.id
                                      ? "border-primary bg-primary/5"
                                      : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                                  )}
                                  onClick={() => setSelectedTableId(item.id)}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-900">{item.label}</p>
                                    <p className="text-xs text-slate-500">{item.kindLabel} • {item.sector}</p>
                                  </div>
                                  <Badge variant="outline" className="shrink-0 rounded-full bg-white">
                                    {item.capacity > 0 ? `${item.capacity} pl.` : "decor"}
                                  </Badge>
                                </button>
                              ))
                            ) : (
                              <p className="text-sm text-slate-500">Aucun element actif dans ce secteur.</p>
                            )}
                          </div>
                        </PanelSection>

                        <PanelSection
                          open={panelSections.layersStats}
                          onOpenChange={(open) => setPanelSectionOpen("layersStats", open)}
                          title="Statistiques"
                          description="Resume rapide de l'etat du secteur."
                        >
                          <div className="grid gap-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-500">Capacite totale</span>
                              <span className="text-lg font-semibold text-slate-900">{visibleCapacity}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-500">Reservations placees</span>
                              <span className="text-lg font-semibold text-slate-900">{placedReservationsCount}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-500">Tables disponibles</span>
                              <span className="text-lg font-semibold text-slate-900">{availableTables.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-500">Sans table</span>
                              <span className="text-lg font-semibold text-slate-900">{unassignedVisibleReservations.length}</span>
                            </div>
                          </div>
                        </PanelSection>
                        </div>
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
        <SheetContent side="left" className="flex w-[92vw] flex-col gap-0 overflow-hidden border-r border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(244,246,251,0.98))] p-0 sm:max-w-[430px]">
          <SheetHeader className="border-b border-slate-200 px-6 py-5">
            <SheetTitle>Panneaux de travail</SheetTitle>
            <SheetDescription>
              Accedez a la bibliotheque et aux reservations sans quitter le plan.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-4 grid shrink-0 grid-cols-2 gap-2 rounded-[24px] border border-slate-200 bg-white/90 p-2 shadow-sm">
              <Button
                type="button"
                variant={leftPanelView === "library" ? "default" : "ghost"}
                className="h-11 rounded-2xl"
                onClick={() => setLeftPanelView("library")}
              >
                <LayoutPanelTop className="mr-2 h-4 w-4" />
                Bibliotheque
              </Button>
              <Button
                type="button"
                variant={leftPanelView === "reservations" ? "default" : "ghost"}
                className="h-11 rounded-2xl"
                onClick={() => setLeftPanelView("reservations")}
              >
                <CalendarClock className="mr-2 h-4 w-4" />
                Reservations
              </Button>
            </div>

            {leftPanelView === "library" ? (
              <ScrollArea className="min-h-0 flex-1 pr-2">
                <div className="space-y-4">
                  {!isTemplateMode ? (
                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                      Passez en mode structure pour ajouter ou supprimer des elements.
                    </div>
                  ) : null}

                  <Tabs value={libraryTab} onValueChange={(value) => setLibraryTab(value as "elements" | "structure" | "decoration")}>
                    <TabsList className={`${SIDE_PANEL_TAB_LIST_CLASS} grid-cols-3`}>
                      <TabsTrigger value="elements" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Elements</TabsTrigger>
                      <TabsTrigger value="structure" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Structure</TabsTrigger>
                      <TabsTrigger value="decoration" className={SIDE_PANEL_TAB_TRIGGER_CLASS}>Decoration</TabsTrigger>
                    </TabsList>

                    <TabsContent value="elements" className="mt-4 space-y-3">
                      <div className={SIDE_PANEL_PRESET_GRID_CLASS}>
                        {libraryPresets.elements.map((preset) => (
                          <PalettePresetButton
                            key={preset.id}
                            preset={preset}
                            onClick={() => {
                              addTableFromPreset(preset.id);
                              setLeftSheetOpen(false);
                            }}
                            disabled={tablesLoading || !isTemplateMode}
                          />
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="structure" className="mt-4 space-y-3">
                      <div className={SIDE_PANEL_PRESET_GRID_CLASS}>
                        {libraryPresets.structure.map((preset) => (
                          <PalettePresetButton
                            key={preset.id}
                            preset={preset}
                            onClick={() => {
                              addTableFromPreset(preset.id);
                              setLeftSheetOpen(false);
                            }}
                            disabled={tablesLoading || !isTemplateMode}
                          />
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="decoration" className="mt-4 space-y-3">
                      <div className={SIDE_PANEL_PRESET_GRID_CLASS}>
                        {libraryPresets.decoration.map((preset) => (
                          <PalettePresetButton
                            key={preset.id}
                            preset={preset}
                            onClick={() => {
                              addTableFromPreset(preset.id);
                              setLeftSheetOpen(false);
                            }}
                            disabled={tablesLoading || !isTemplateMode}
                          />
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-3">
                    <Label htmlFor="new-sector-sheet" className="text-xs uppercase tracking-[0.18em] text-slate-500">Nouveau secteur</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        id="new-sector-sheet"
                        value={newSectorName}
                        placeholder="Terrasse, Salon VIP..."
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                        disabled={!isTemplateMode}
                        onChange={(event) => setNewSectorName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSector();
                          }
                        }}
                      />
                      <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white" onClick={addSector} disabled={!isTemplateMode}>
                        <Plus className="mr-2 h-4 w-4" />
                        Ajouter
                      </Button>
                    </div>
                  </div>

                  {selectedId ? (
                    <div className="rounded-[24px] border border-slate-200 bg-white/90 p-1">
                      <FloorPlanAIPanel
                        restaurantId={selectedId}
                        currentLayout={draftTables.map((t) => ({
                          table_number: t.table_number,
                          capacity: t.capacity,
                          layout: { x: t.layout.x, y: t.layout.y, w: t.layout.w, h: t.layout.h, shape: t.layout.shape, kind: t.layout.kind },
                        }))}
                        canvasWidth={CANVAS_WIDTH}
                        canvasHeight={CANVAS_HEIGHT}
                        onApply={(layout) => {
                          applyAILayout(layout);
                          setLeftSheetOpen(false);
                        }}
                        disabled={!isTemplateMode}
                      />
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            ) : (
              <>
                <div className="relative mb-4">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={reservationQuery}
                    onChange={(event) => setReservationQuery(event.target.value)}
                    placeholder="Rechercher un nom, numero, service..."
                    className="h-11 rounded-2xl border-slate-200 bg-white pl-9"
                  />
                </div>
                <ScrollArea className="min-h-0 flex-1 pr-2">
                  <div className="space-y-3">
                    {reservationsLoading ? (
                      <p className="text-sm text-muted-foreground">Chargement des reservations...</p>
                    ) : null}

                    {filteredReservations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune reservation pour les filtres selectionnes.</p>
                    ) : null}

                    {filteredReservations.map((reservation) => {
                      const assignedTableId = draftAssignments[reservation.id];
                      const assignedTable = assignedTableId ? tableMap.get(assignedTableId) || null : null;
                      const isSelected = reservation.id === selectedReservationId;
                      const reservationService = getReservationService(reservation);
                      const isZeroAttente = isZeroAttenteReservation(reservation);
                      const preorderItems = getReservationPreorderItems(reservation);

                      return (
                        <div
                          key={reservation.id}
                          role="button"
                          tabIndex={0}
                          draggable
                          onClick={() => {
                            setSelectedReservationId(reservation.id);
                            if (assignedTableId) {
                              setSelectedTableId(assignedTableId);
                            }
                            setLeftSheetOpen(false);
                          }}
                          onDragStart={(event) => handleReservationDragStart(event, reservation.id)}
                          onDragEnd={handleReservationDragEnd}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedReservationId(reservation.id);
                              if (assignedTableId) {
                                setSelectedTableId(assignedTableId);
                              }
                              setLeftSheetOpen(false);
                            }
                          }}
                          className={cn(
                            "w-full cursor-grab rounded-2xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 active:cursor-grabbing",
                            isSelected && isZeroAttente && "border-teal-500 bg-teal-50 shadow-sm ring-2 ring-teal-200",
                            isSelected && !isZeroAttente && "border-primary bg-primary/5 shadow-sm",
                            !isSelected && isZeroAttente && "border-teal-200 bg-teal-50/60 hover:bg-teal-50",
                            !isSelected && !isZeroAttente && "border-border bg-background hover:bg-muted/40",
                            draggedReservationId === reservation.id && "scale-[0.99] opacity-60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{getReservationCustomerLabel(reservation)}</span>
                                {isZeroAttente ? (
                                  <Badge className="border border-teal-200 bg-teal-100 text-teal-800">
                                    Zero Attente
                                  </Badge>
                                ) : null}
                                <Badge className={cn("border", getReservationStatusTone(reservation.status))}>
                                  {reservation.status || "pending"}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {getSafeTime(reservation.time)}
                                </span>
                                <span>{getShortDateLabel(reservation.date)}</span>
                                <span>{reservation.party_size} pers.</span>
                                <span>{getServicePeriodLabel(reservationService)}</span>
                                {preorderItems.length > 0 ? (
                                  <span>{preorderItems.length} produit(s)</span>
                                ) : null}
                              </div>
                              {assignedTable ? (
                                <Badge variant="outline" className="bg-background">
                                  Affectee a {assignedTable.table_number}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-200 bg-background text-amber-700">
                                  Sans table
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}
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
