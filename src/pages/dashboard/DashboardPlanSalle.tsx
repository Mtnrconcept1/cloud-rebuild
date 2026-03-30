import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Armchair,
  CalendarClock,
  Clock3,
  Grip,
  LayoutPanelTop,
  Minus,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  FLOOR_PLAN_PRESETS,
  buildDraftFloorPlanLayout,
  clampFloorPlanLayout,
  ensureFloorPlanLayoutFitsCapacity,
  getMinimumTableSize,
  normalizeFloorPlanLayout,
  reservationsOverlap,
  type FloorPlanTableLayout,
  type FloorPlanTableShape,
} from "@/lib/floorPlan";
import {
  DASHBOARD_TIME_RANGE_OPTIONS,
  formatDashboardDateHeading,
  getTodayReferenceDate,
  isDateInDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/dashboardTimeRange";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";

import { useDashboardRestaurant } from "./DashboardContext";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReservationWithCustomer = ReservationRow & {
  customer: Pick<ProfileRow, "full_name" | "phone"> | null;
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
    seat_labels: layout.seatLabels,
  };
}

function areLayoutsEquivalent(left: FloorPlanTableLayout, right: FloorPlanTableLayout) {
  return JSON.stringify(layoutToRecord(left)) === JSON.stringify(layoutToRecord(right));
}

function buildTemplateLayout(rawLayout: unknown, fallbackIndex: number, capacity: number) {
  return ensureFloorPlanLayoutFitsCapacity(
    normalizeFloorPlanLayout(rawLayout, fallbackIndex, capacity),
    capacity,
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
      seat_labels: templateLayout.seatLabels,
    },
    fallbackIndex,
    capacity,
    templateLayout.shape,
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
      seatLabels: templateLayout.seatLabels,
    },
    capacity,
    templateLayout.shape,
  );
}

function getNextTableNumber(tables: DraftTable[]) {
  const usedNumbers = new Set(
    tables
      .map((table) => Number.parseInt(String(table.table_number).replace(/[^\d]/g, ""), 10))
      .filter((value) => Number.isFinite(value)),
  );

  let candidate = 1;
  while (usedNumbers.has(candidate)) {
    candidate += 1;
  }

  return `Table ${candidate}`;
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

function getTableContentPadding(layout: FloorPlanTableLayout) {
  if (layout.shape === "round") {
    const horizontal = Math.max(4, Math.min(layout.w * 0.14, 28));
    const vertical = Math.max(4, Math.min(layout.h * 0.12, 24));
    return {
      top: vertical,
      right: horizontal,
      bottom: vertical,
      left: horizontal,
    };
  }

  const horizontal = Math.max(4, Math.min(layout.w * 0.08, 22));
  const vertical = Math.max(4, Math.min(layout.h * 0.1, 18));
  return {
    top: vertical,
    right: horizontal,
    bottom: vertical,
    left: horizontal,
  };
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

export default function DashboardPlanSalle() {
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);

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
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasWidth, setCanvasWidth] = useState(CANVAS_WIDTH);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;

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
      persistedTables.map((table, index) => ({
        const capacity = Number(table.capacity || 2);
        const templateLayout = buildTemplateLayout(table.layout, index, capacity);
        const overrideLayout = layoutOverridesByTableId.get(table.id)?.layout;

        return {
        id: table.id,
        persisted: true,
        branch_id: table.branch_id,
        table_number: table.table_number,
        capacity,
        is_active: table.is_active ?? true,
        sector: table.sector?.trim() || DEFAULT_SECTOR,
        layout: editMode === "service" && overrideLayout
          ? buildServiceLayout(templateLayout, overrideLayout, index, capacity)
          : templateLayout,
      };
      })),
    );
    setExtraSectors([]);
  }, [editMode, layoutOverridesByTableId, persistedTables, selectedBranchId]);

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

  const filteredReservations = useMemo(() => (
    branchScopedReservations
      .filter((reservation) => {
        if (!isDateInDashboardTimeRange(reservation.date, timeRange, referenceDate, { dateOnly: true })) return false;
        if (serviceFilter !== "all" && getReservationService(reservation) !== serviceFilter) return false;
        if (statusFilter !== "all" && String(reservation.status || "pending") !== statusFilter) return false;
        return true;
      })
      .sort((left, right) => sortReservations(left, right, sortBy))
  ), [branchScopedReservations, referenceDate, serviceFilter, sortBy, statusFilter, timeRange]);

  const visibleTables = useMemo(() => (
    draftTables
      .filter((table) => table.is_active)
      .filter((table) => table.sector === selectedSector)
      .sort((left, right) => left.table_number.localeCompare(right.table_number, "fr"))
  ), [draftTables, selectedSector]);

  const tableMap = useMemo(
    () => new Map(draftTables.map((table) => [table.id, table])),
    [draftTables],
  );

  const visibleTableIdSet = useMemo(
    () => new Set(visibleTables.map((table) => table.id)),
    [visibleTables],
  );

  const visibleAssignmentsByTable = useMemo(() => {
    const grouped = new Map<string, ReservationWithCustomer[]>();
    filteredReservations.forEach((reservation) => {
      const tableId = draftAssignments[reservation.id];
      if (!tableId || !visibleTableIdSet.has(tableId)) return;
      grouped.set(tableId, [...(grouped.get(tableId) || []), reservation]);
    });

    grouped.forEach((items, tableId) => {
      grouped.set(tableId, [...items].sort((left, right) => sortReservations(left, right, "time")));
    });

    return grouped;
  }, [draftAssignments, filteredReservations, visibleTableIdSet]);

  const selectedReservation = selectedReservationId ? reservationsById.get(selectedReservationId) || null : null;
  const selectedTable = selectedTableId ? tableMap.get(selectedTableId) || null : null;
  const selectedTableAssignments = useMemo(() => {
    if (!selectedTableId) return [];
    return (visibleAssignmentsByTable.get(selectedTableId) || []).slice(0, 6);
  }, [selectedTableId, visibleAssignmentsByTable]);

  const assignedVisibleTableIds = useMemo(() => {
    const values = new Set<string>();
    filteredReservations.forEach((reservation) => {
      const tableId = draftAssignments[reservation.id];
      if (tableId && visibleTableIdSet.has(tableId)) {
        values.add(tableId);
      }
    });
    return values;
  }, [draftAssignments, filteredReservations, visibleTableIdSet]);

  const unassignedVisibleReservations = useMemo(
    () => filteredReservations.filter((reservation) => !draftAssignments[reservation.id]),
    [draftAssignments, filteredReservations],
  );

  const availableTables = visibleTables.filter((table) => !assignedVisibleTableIds.has(table.id));
  const availableCovers = availableTables.reduce((sum, table) => sum + table.capacity, 0);
  const canPersist = !!selectedBranchId;
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
    for (let index = visibleTables.length - 1; index >= 0; index -= 1) {
      const table = visibleTables[index];
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
    if (!dragState && !resizeState) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      if (!point) return;

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
          const minimumSize = getMinimumTableSize(table.capacity, resizeState.startLayout.shape);
          const resizedFrame = resizeRenderedTableFrame(
            resizeState.startFrame,
            resizeState.handle,
            deltaX,
            deltaY,
            minimumSize.w * canvasZoom,
            minimumSize.h * canvasZoom,
          );
          const resizedLayout = ensureFloorPlanLayoutFitsCapacity(
            {
              ...resizeState.startLayout,
              w: resizedFrame.w / canvasZoom,
              h: resizedFrame.h / canvasZoom,
            },
            table.capacity,
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
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [canvasWidth, canvasZoom, dragState, resizeState]);

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
    mutationFn: async () => {
      if (!selectedBranchId) throw new Error("Selectionnez d'abord une salle.");

      const tempIdToPersistedId = new Map<string, string>();

      for (const table of draftTables) {
        const payload = {
          branch_id: selectedBranchId,
          table_number: table.table_number.trim() || getNextTableNumber(draftTables),
          capacity: Math.max(1, Math.round(table.capacity || 1)),
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["floor-plan-tables", selectedBranchId] });
      queryClient.invalidateQueries({ queryKey: ["floor-plan-slots", selectedBranchId] });
      queryClient.invalidateQueries({ queryKey: ["floor-plan-reservations", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] });
      toast({
        title: "Plan de salle sauvegarde",
        description: "Les tables et affectations ont ete enregistrees.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur de sauvegarde", description: error.message, variant: "destructive" });
    },
  });

  const addSector = () => {
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

    const preset = FLOOR_PLAN_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    const tableId = `draft-${crypto.randomUUID()}`;
    setDraftTables((current) => [
      ...current,
      {
        id: tableId,
        persisted: false,
        branch_id: selectedBranchId,
        table_number: getNextTableNumber(current),
        capacity: preset.capacity,
        is_active: true,
        sector: selectedSector,
        layout: buildDraftFloorPlanLayout(current.length, preset),
      },
    ]);
    setSelectedTableId(tableId);
  };

  const startDraggingTable = (event: React.PointerEvent<HTMLButtonElement>, tableId: string) => {
    event.preventDefault();
    setResizeState(null);

    const table = tableMap.get(tableId);
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!table || !point) return;
    const renderedFrame = getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT);

    setDragState({
      tableId,
      offsetX: point.x - renderedFrame.x,
      offsetY: point.y - renderedFrame.y,
    });
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <LayoutPanelTop className="h-3.5 w-3.5" />
              Plan de salle
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Plan de salle et placements</h1>
              <p className="text-sm text-muted-foreground">
                Parametrez votre salle, organisez vos tables et affectez vos reservations par date et horaire.
              </p>
            </div>
            {selectedRestaurant ? (
              <p className="text-sm font-medium text-foreground">
                Restaurateur : <span className="text-primary">{selectedRestaurant.name}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => createDefaultBranchMutation.mutate()}
              disabled={!selectedId || createDefaultBranchMutation.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              {branches.length === 0 ? "Initialiser une salle" : "Ajouter une salle"}
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!canPersist || saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>

        {restaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {restaurantsError ? <p className="text-destructive">Erreur restaurants : {restaurantsError}</p> : null}
        {branchesError ? <p className="text-destructive">Erreur salles : {(branchesError as Error).message}</p> : null}
        {tablesError ? <p className="text-destructive">Erreur tables : {(tablesError as Error).message}</p> : null}
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
          <>
            <div className="grid grid-cols-1 gap-3 rounded-2xl border bg-card p-4 md:grid-cols-2 xl:grid-cols-7">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Salle</p>
                <Select value={selectedBranchId || ""} onValueChange={setSelectedBranchId}>
                  <SelectTrigger>
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

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Secteur</p>
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger>
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

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Periode</p>
                <Select value={timeRange} onValueChange={(value) => setTimeRange(value as DashboardTimeRange)}>
                  <SelectTrigger>
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

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Date de reference</p>
                <Input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
              </div>

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
                <Select value={serviceFilter} onValueChange={(value) => setServiceFilter(value as ServiceFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="lunch">Midi</SelectItem>
                    <SelectItem value="dinner">Soir</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
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

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tri</p>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                  <SelectTrigger>
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

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tables visibles</p>
                    <p className="text-2xl font-bold">{visibleTables.length}</p>
                    <p className="text-xs text-muted-foreground">{selectedSector}</p>
                  </div>
                  <Armchair className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Reservations filtrees</p>
                    <p className="text-2xl font-bold">{filteredReservations.length}</p>
                    <p className="text-xs text-muted-foreground">{unassignedVisibleReservations.length} sans table</p>
                  </div>
                  <CalendarClock className="h-5 w-5 text-amber-500" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tables disponibles</p>
                    <p className="text-2xl font-bold">{availableTables.length}</p>
                    <p className="text-xs text-muted-foreground">{availableCovers} couverts disponibles</p>
                  </div>
                  <Users className="h-5 w-5 text-emerald-500" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Salle active</p>
                    <p className="text-lg font-bold">{selectedBranch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedBranch.city} - {selectedBranch.address}
                    </p>
                  </div>
                  <LayoutPanelTop className="h-5 w-5 text-sky-500" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Palette de tables</CardTitle>
                    <CardDescription>Ajoutez rapidement des tables puis deplacez-les dans le plan.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {FLOOR_PLAN_PRESETS.map((preset) => (
                        <Button
                          key={preset.id}
                          variant="outline"
                          className="h-auto flex-col items-start gap-1 px-3 py-3 text-left"
                          onClick={() => addTableFromPreset(preset.id)}
                          disabled={tablesLoading}
                        >
                          <span className="font-semibold">{preset.label}</span>
                          <span className="text-xs text-muted-foreground">{preset.capacity} couverts</span>
                        </Button>
                      ))}
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="new-sector">Nouveau secteur</Label>
                      <div className="flex gap-2">
                        <Input
                          id="new-sector"
                          value={newSectorName}
                          placeholder="Terrasse, Salon VIP..."
                          onChange={(event) => setNewSectorName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addSector();
                            }
                          }}
                        />
                        <Button variant="outline" onClick={addSector}>
                          <Plus className="mr-2 h-4 w-4" />
                          Ajouter
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Reservations a placer</CardTitle>
                    <CardDescription>
                      Glissez une reservation sur une table ou utilisez le bouton Affecter.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[620px]">
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

                          return (
                            <div
                              key={reservation.id}
                              role="button"
                              tabIndex={0}
                              draggable
                              onClick={() => setSelectedReservationId(reservation.id)}
                              onDragStart={(event) => handleReservationDragStart(event, reservation.id)}
                              onDragEnd={handleReservationDragEnd}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedReservationId(reservation.id);
                                }
                              }}
                              className={cn(
                                "w-full cursor-grab rounded-2xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 active:cursor-grabbing",
                                isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:bg-muted/40",
                                draggedReservationId === reservation.id && "scale-[0.99] opacity-60",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold">{getReservationCustomerLabel(reservation)}</span>
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
                  </CardContent>
                </Card>
              </div>

              <div className="min-w-0 space-y-4">
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/20 pb-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-xl">{selectedSector}</CardTitle>
                      <CardDescription>
                        {formatDashboardDateHeading(referenceDate)} - {filteredReservations.length} reservation(s) visibles
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-background">
                        Drag reservations sur les tables, poignee pour deplacer la table
                      </Badge>
                      <div className="flex items-center gap-1 rounded-full border bg-background px-1 py-1 shadow-sm">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
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
                          className="h-8 w-8 rounded-full"
                          onClick={() => updateCanvasZoom(1)}
                          disabled={canvasZoom === 1}
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          onClick={() => updateCanvasZoom(canvasZoom + CANVAS_ZOOM_STEP)}
                          disabled={canvasZoom >= MAX_CANVAS_ZOOM}
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div ref={canvasViewportRef} className="w-full">
                    <ScrollArea className="w-full">
                      <div
                        ref={canvasRef}
                        className="relative overflow-hidden"
                        onWheelCapture={handleCanvasWheel}
                        onDragOver={handleCanvasDragOver}
                        onDrop={handleCanvasDrop}
                        onDragLeave={handleCanvasDragLeave}
                        style={{
                          width: canvasWidth,
                          height: CANVAS_HEIGHT,
                          backgroundImage: "linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px), radial-gradient(circle at top left, rgba(255,237,213,0.65), transparent 28%), radial-gradient(circle at bottom right, rgba(224,242,254,0.55), transparent 24%)",
                          backgroundSize: "28px 28px, 28px 28px, 100% 100%, 100% 100%",
                          backgroundColor: "rgba(248,250,252,0.95)",
                        }}
                      >
                        <div
                          className="relative h-full w-full overflow-hidden"
                          style={{
                            width: canvasWidth,
                            height: CANVAS_HEIGHT,
                          }}
                        >
                          {visibleTables.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                              <LayoutPanelTop className="h-10 w-10 text-primary/60" />
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">Aucune table dans ce secteur</p>
                                <p className="text-sm">Ajoutez une table depuis la palette de gauche pour commencer.</p>
                              </div>
                            </div>
                          ) : null}

                          {visibleTables.map((table) => {
                            const assignments = visibleAssignmentsByTable.get(table.id) || [];
                            const primaryAssignment = assignments[0] || null;
                            const isSelected = table.id === selectedTableId;
                            const shapeClass = table.layout.shape === "round" ? "rounded-full" : "rounded-[1.75rem]";
                            const activeDraggedReservationId = draggedReservationId;
                            const dropState = activeDraggedReservationId
                              ? getReservationDropState(activeDraggedReservationId, table.id)
                              : null;
                            const isDragTarget = dragOverTableId === table.id && !!activeDraggedReservationId;
                            const canDropHere = !!dropState?.ok;
                            const renderedFrame = getRenderedTableFrame(table.layout, canvasZoom, canvasWidth, CANVAS_HEIGHT);
                            const density = getTableDensity(renderedFrame);
                            const isTight = density === "tight";
                            const contentPadding = getTableContentPadding({
                              ...table.layout,
                              w: renderedFrame.w,
                              h: renderedFrame.h,
                            });
                            const coverLabel = density === "regular" ? `${table.capacity} couverts` : `${table.capacity} couv.`;
                            const reservationCustomerLabel = primaryAssignment
                              ? getCompactReservationCustomerLabel(primaryAssignment, density)
                              : null;
                            const reservationMetaLabel = primaryAssignment
                              ? density === "tight"
                                ? `${primaryAssignment.party_size}p · ${getShortDateLabel(primaryAssignment.date)}`
                                : `${primaryAssignment.party_size} pers. · ${getShortDateLabel(primaryAssignment.date)}`
                              : null;

                            void reservationMetaLabel;

                            const reservationDetailLabel = primaryAssignment
                              ? density === "tight"
                                ? `${primaryAssignment.party_size}p - ${getShortDateLabel(primaryAssignment.date)}`
                                : `${primaryAssignment.party_size} pers. - ${getShortDateLabel(primaryAssignment.date)}`
                              : null;

                            return (
                              <div
                                key={table.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setSelectedTableId(table.id);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setSelectedTableId(table.id);
                                  }
                                }}
                                className="absolute text-left focus:outline-none"
                                style={{
                                  left: renderedFrame.x,
                                  top: renderedFrame.y,
                                  width: renderedFrame.w,
                                  height: renderedFrame.h,
                                  zIndex: isSelected ? 40 : assignments.length > 0 ? 24 : 12,
                                }}
                              >
                                <div
                                  className="relative h-full w-full"
                                  style={{
                                    transform: `rotate(${table.layout.rotation}deg)`,
                                    transformOrigin: "center center",
                                  }}
                                >
                                  <div
                                    className={cn(
                                      "absolute inset-0 border bg-[#fff8ef] shadow-[0_18px_35px_-24px_rgba(120,53,15,0.55)] transition-all",
                                      shapeClass,
                                      isSelected ? "border-primary ring-2 ring-primary/30" : "border-[#ddb78f] hover:border-primary/60",
                                      isDragTarget && canDropHere && "border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-200",
                                      isDragTarget && !canDropHere && "border-rose-500 bg-rose-50/80 ring-2 ring-rose-200",
                                    )}
                                  />

                                  <div className={cn("absolute inset-0 overflow-hidden", shapeClass)}>
                                    <div
                                      className={cn(
                                        "relative flex h-full min-h-0 flex-col",
                                        density === "regular" ? "gap-3" : density === "compact" ? "gap-2" : "gap-1.5",
                                      )}
                                      style={{
                                        paddingTop: contentPadding.top,
                                        paddingRight: contentPadding.right,
                                        paddingBottom: contentPadding.bottom,
                                        paddingLeft: contentPadding.left,
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className={cn(
                                            "break-words font-semibold text-foreground",
                                            density === "regular"
                                              ? "text-base leading-none"
                                              : density === "compact"
                                                ? "text-[11px] leading-tight"
                                                : "text-[9px] leading-tight",
                                          )}
                                          >
                                            {table.table_number}
                                          </p>
                                          <p className={cn(
                                            "mt-1 break-words uppercase text-muted-foreground",
                                            density === "regular"
                                              ? "text-[10px] tracking-[0.18em]"
                                              : density === "compact"
                                                ? "text-[8px] tracking-[0.12em]"
                                                : "text-[7px] tracking-[0.08em]",
                                          )}
                                          >
                                            {coverLabel}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          className={cn(
                                            "shrink-0 rounded-full border bg-background/90 text-muted-foreground shadow-sm",
                                            density === "regular"
                                              ? "p-1"
                                              : density === "compact"
                                                ? "p-0.5"
                                                : "p-0.5",
                                          )}
                                          onPointerDown={(event) => {
                                            event.stopPropagation();
                                            startDraggingTable(event, table.id);
                                          }}
                                        >
                                          <Grip className={cn(
                                            density === "regular"
                                              ? "h-4 w-4"
                                              : density === "compact"
                                                ? "h-3.5 w-3.5"
                                                : "h-3 w-3",
                                          )}
                                          />
                                        </button>
                                      </div>

                                      <div className={cn(
                                        "flex min-h-0 flex-1 flex-col items-center justify-center",
                                        density === "regular" ? "gap-2" : density === "compact" ? "gap-1.5" : "gap-1",
                                      )}>
                                        {primaryAssignment ? (
                                          <div className={cn(
                                            "w-full max-w-full border border-[#ebd4bb] bg-white/96 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.45)]",
                                            density === "regular"
                                              ? "rounded-[1.25rem] px-3 py-2"
                                              : density === "compact"
                                                ? "rounded-xl px-2 py-1.5"
                                                : "rounded-lg px-1.5 py-1",
                                          )}>
                                            <div className="flex items-start justify-between gap-1.5">
                                              <p className={cn(
                                                "min-w-0 break-words font-semibold leading-tight text-foreground",
                                                density === "regular"
                                                  ? "text-[13px]"
                                                  : density === "compact"
                                                    ? "text-[10px]"
                                                    : "text-[8px]",
                                              )}>
                                                {reservationCustomerLabel}
                                              </p>
                                              <span className={cn(
                                                "shrink-0 rounded-full bg-orange-100 font-semibold text-orange-800",
                                                density === "regular"
                                                  ? "px-2 py-0.5 text-[11px]"
                                                  : density === "compact"
                                                    ? "px-1.5 py-0.5 text-[9px]"
                                                    : "px-1 py-0.5 text-[7px]",
                                              )}>
                                                {getSafeTime(primaryAssignment.time)}
                                              </span>
                                            </div>
                                            <p className={cn(
                                              "mt-1 break-words text-muted-foreground",
                                              density === "regular"
                                                ? "text-[11px]"
                                                : density === "compact"
                                                  ? "text-[9px]"
                                                  : "text-[7px]",
                                            )}>
                                              {reservationDetailLabel}
                                            </p>
                                            <div className={cn("mt-1", isTight && "mt-0.5")}>
                                              <span className={cn(
                                                "inline-flex max-w-full break-words rounded-full border font-semibold",
                                                getReservationStatusTone(primaryAssignment.status),
                                                density === "regular"
                                                  ? "px-2 py-0.5 text-[10px]"
                                                  : density === "compact"
                                                    ? "px-1.5 py-0.5 text-[8px]"
                                                    : "px-1 py-0.5 text-[7px]",
                                              )}>
                                                {primaryAssignment.status || "pending"}
                                              </span>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className={cn(
                                            "mx-auto inline-flex max-w-full items-center justify-center rounded-full border border-dashed border-[#d8b894] bg-white/55 text-center font-medium uppercase text-[#8f5d32]",
                                            density === "regular"
                                              ? "px-4 py-2 text-[11px] tracking-[0.22em]"
                                              : density === "compact"
                                                ? "px-3 py-1.5 text-[9px] tracking-[0.14em]"
                                                : "px-2 py-1 text-[7px] tracking-[0.08em]",
                                          )}>
                                            {isTight ? "Libre" : "Disponible"}
                                          </div>
                                        )}

                                        {assignments.length > 1 ? (
                                          <div className={cn(
                                            "max-w-full break-words text-center font-medium text-muted-foreground",
                                            density === "regular"
                                              ? "text-[11px]"
                                              : density === "compact"
                                                ? "text-[9px]"
                                                : "text-[7px]",
                                          )}>
                                            +{assignments.length - 1} autre(s) reservation(s)
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>

                                    {isDragTarget && activeDraggedReservationId ? (
                                      <div
                                        className="pointer-events-none absolute z-20"
                                        style={{
                                          left: contentPadding.left,
                                          right: contentPadding.right,
                                          bottom: contentPadding.bottom,
                                        }}
                                      >
                                        <div
                                          className={cn(
                                            "rounded-2xl border px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur-sm",
                                            canDropHere
                                              ? "border-emerald-200 bg-emerald-100/95 text-emerald-800"
                                              : "border-rose-200 bg-rose-100/95 text-rose-800",
                                          )}
                                        >
                                          {canDropHere ? "Lacher pour affecter ici" : dropState?.reason}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>

                                  {isSelected ? (
                                    <button
                                      type="button"
                                      aria-label={`Redimensionner ${table.table_number}`}
                                      className={cn(
                                        "absolute h-4 w-4 rounded-full border border-primary/50 bg-white shadow-sm",
                                        PRIMARY_RESIZE_HANDLE.className,
                                      )}
                                      style={{
                                        cursor: PRIMARY_RESIZE_HANDLE.cursor,
                                        bottom: Math.max(8, contentPadding.bottom - 6),
                                        right: Math.max(8, contentPadding.right - 6),
                                      }}
                                      onPointerDown={(event) => startResizingTable(event, table.id, PRIMARY_RESIZE_HANDLE.key)}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>

              <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Inspection</CardTitle>
                    <CardDescription>
                      Ajustez la table selectionnee ou finalisez le placement de la reservation active.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedReservation ? (
                      <div className="rounded-2xl border bg-muted/30 p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
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
                          <Badge variant="outline">{getServicePeriodLabel(getReservationService(selectedReservation))}</Badge>
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
                          {selectedTable ? (
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
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        Selectionnez une reservation dans la colonne de gauche pour preparer son placement.
                      </div>
                    )}

                    <Separator />

                    {selectedTable ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Table selectionnee</p>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{selectedTable.sector}</p>
                        </div>

                        <div className="grid gap-3">
                          <div className="space-y-2">
                            <Label>Nom de table</Label>
                            <Input
                              value={selectedTable.table_number}
                              onChange={(event) => updateDraftTable(selectedTable.id, (table) => ({
                                ...table,
                                table_number: event.target.value,
                              }))}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Capacite</Label>
                              <Input
                                type="number"
                                min={1}
                                value={selectedTable.capacity}
                                onChange={(event) => {
                                  const nextCapacity = Math.max(1, Number.parseInt(event.target.value || "1", 10) || 1);
                                  updateDraftTable(selectedTable.id, (table) => ({
                                    ...table,
                                    capacity: nextCapacity,
                                    layout: ensureFloorPlanLayoutFitsCapacity(table.layout, nextCapacity, table.layout.shape),
                                  }));
                                }}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Forme</Label>
                              <Select
                                value={selectedTable.layout.shape}
                                onValueChange={(value) => {
                                  const nextShape = value as FloorPlanTableShape;
                                  updateDraftTable(selectedTable.id, (table) => ({
                                    ...table,
                                    layout: ensureFloorPlanLayoutFitsCapacity(table.layout, table.capacity, nextShape),
                                  }));
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="rect">Rectangle</SelectItem>
                                  <SelectItem value="round">Ronde</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Secteur</Label>
                            <Select
                              value={selectedTable.sector}
                              onValueChange={(value) => updateDraftTable(selectedTable.id, (table) => ({
                                ...table,
                                sector: value,
                              }))}
                            >
                              <SelectTrigger>
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

                          <div className="flex items-center justify-between rounded-2xl border px-4 py-3">
                            <div>
                              <p className="font-medium">Table active</p>
                              <p className="text-sm text-muted-foreground">Inactivee = masquee du plan et des placements.</p>
                            </div>
                            <Switch
                              checked={selectedTable.is_active}
                              onCheckedChange={(checked) => updateDraftTable(selectedTable.id, (table) => ({
                                ...table,
                                is_active: checked,
                              }))}
                            />
                          </div>

                          <Button variant="outline" className="justify-start text-destructive" onClick={() => removeDraftTable(selectedTable.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer la table
                          </Button>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">Planning sur cette table</p>
                            <Badge variant="outline">{selectedTableAssignments.length}</Badge>
                          </div>
                          {selectedTableAssignments.length > 0 ? (
                            <div className="space-y-2">
                              {selectedTableAssignments.map((reservation) => (
                                <div key={reservation.id} className="rounded-2xl border bg-muted/20 px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium">{getReservationCustomerLabel(reservation)}</span>
                                    <span className="text-sm text-muted-foreground">{getSafeTime(reservation.time)}</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span>{getShortDateLabel(reservation.date)}</span>
                                    <span>{reservation.party_size} pers.</span>
                                    <span>{reservation.status || "pending"}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Aucune reservation visible n'est actuellement affectee a cette table.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        Selectionnez une table dans le plan pour modifier ses proprietes.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
