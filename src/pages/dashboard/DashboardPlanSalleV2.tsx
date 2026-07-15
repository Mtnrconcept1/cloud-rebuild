import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Expand, FlaskConical, RefreshCw } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { getTodayReferenceDate } from "@/lib/dashboardTimeRange";
import {
  buildFloorPlanV2Assignments,
  computeFloorPlanV2AutoAssignments,
  getFloorPlanV2AssignmentError,
  getFloorPlanV2ReservationRecommendation,
  mapFloorPlanV2Table,
  parseFloorPlanV2ObjectDrafts,
  parseFloorPlanV2TableDrafts,
  serializeFloorPlanV2Layout,
  serializeFloorPlanV2Object,
  type FloorPlanV2Period,
  type FloorPlanV2Reservation,
  type FloorPlanV2Table,
} from "@/lib/floorPlanV2";
import { updateRestaurantReservationStatus } from "@/lib/reservationMutations";
import { getServicePeriodFromMetadata } from "@/lib/serviceSettings";

import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();
const PROTOTYPE_URL = "/tok-table-v2/index.html?connected=1";
const RELEASED_STATUSES = new Set(["cancelled", "canceled", "no_show", "completed", "archived"]);
const EDITABLE_RESERVATION_STATUSES = new Set(["pending", "confirmed", "arrived", "seated", "no_show"]);
const LIVE_REFRESH_INTERVAL_MS = 15_000;
const BRIDGE_PROTOCOL_VERSION = 2;
const PERSISTENCE_TIMEOUT_MS = 50_000;
const BRIDGE_OPERATION_KINDS = {
  "tok-table-v2:assign": "assignment",
  "tok-table-v2:auto-place-request": "assignment",
  "tok-table-v2:update-reservation-status": "reservation-status",
  "tok-table-v2:load-variant": "variant-load",
  "tok-table-v2:save-variant": "variant",
  "tok-table-v2:save-template": "template",
  "tok-table-v2:save-service-layout": "service-layout",
} as const;

type BranchRow = Database["public"]["Tables"]["restaurant_branches"]["Row"];
type TableRow = Database["public"]["Tables"]["reservation_tables"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type SlotRow = Database["public"]["Tables"]["reservation_slots"]["Row"];
type LayoutOverrideRow = Database["public"]["Tables"]["reservation_table_layout_overrides"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type TableRevisionRow = Pick<
  TableRow,
  "id" | "table_number" | "capacity" | "is_active" | "sector" | "layout"
>;
type LayoutOverrideRevisionRow = Pick<
  LayoutOverrideRow,
  "id" | "reservation_table_id" | "service_date" | "layout"
>;
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
type ReservationWithCustomer = ReservationRow & {
  customer: Pick<ProfileRow, "full_name"> | null;
};

type AssignmentRequest = {
  requestId: string;
  assignments: Record<string, string | null>;
  successMessage: string;
};

type TableSaveRequest = {
  requestId: string;
  protocolVersion: number;
  baseRevision: string;
  rawTables: unknown;
  rawObjects?: unknown;
  baselineTableIds?: unknown;
  baselineObjectIds?: unknown;
};

type ReservationStatusRequest = {
  requestId: string;
  reservationId: string;
  status: string;
};

type VariantSaveRequest = Omit<TableSaveRequest, "baseRevision" | "baselineTableIds" | "baselineObjectIds"> & {
  name: string;
};

type TemplateSaveResult = {
  idMap: Record<string, string>;
  serverRevision: string;
};

type ServiceSaveResult = {
  serverRevision: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getNullableBoolean(value: unknown, message: string): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === null) return null;
  throw new Error(message);
}

function getNullableString(value: unknown, message: string): string | null {
  if (typeof value === "string") return value;
  if (value === null) return null;
  throw new Error(message);
}

function getReservationPeriod(reservation: ReservationRow): FloorPlanV2Period {
  const service = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
  return service === "lunch" ? "midi" : "soir";
}

function getPreferredZone(reservation: ReservationRow) {
  const metadata = asRecord(reservation.metadata);
  const value = metadata.preferred_zone ?? metadata.preferredZone ?? metadata.sector;
  return typeof value === "string" ? value : "";
}

function getReservationDuration(reservation: ReservationRow) {
  const metadata = asRecord(reservation.metadata);
  const value = Number(metadata.duration_minutes ?? metadata.durationMinutes);
  return Number.isFinite(value) ? Math.max(30, value) : 120;
}

function getReservationFeature(reservation: ReservationRow) {
  const metadata = asRecord(reservation.metadata);
  const value = metadata.feature ?? reservation.feature;
  return typeof value === "string" ? value : "standard";
}

function getReservationMiamzPriority(reservation: ReservationRow) {
  const metadata = asRecord(reservation.metadata);
  const miamz = asRecord(metadata.miamz);
  const value = Number(metadata.miamz_priority_score ?? miamz.reservation_priority_score);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function toFloorPlanV2Reservation(
  reservation: ReservationWithCustomer,
  tableId: string | null,
): FloorPlanV2Reservation {
  return {
    id: reservation.id,
    name: reservation.customer?.full_name?.trim() || "Client sans nom",
    size: Math.max(1, Number(reservation.party_size) || 1),
    time: reservation.time.slice(0, 5),
    date: reservation.date,
    period: getReservationPeriod(reservation),
    preferredZone: getPreferredZone(reservation),
    note: reservation.special_requests?.trim() || reservation.notes?.trim() || "",
    durationMinutes: getReservationDuration(reservation),
    tableId,
    status: String(reservation.status || "pending"),
    feature: getReservationFeature(reservation),
    miamzPriority: getReservationMiamzPriority(reservation),
  };
}

function getOperationId(value: unknown) {
  const id = String(value || "").trim();
  return id && id.length <= 100 ? id : `floor-plan-${Date.now()}`;
}

async function withPersistenceTimeout<T>(operation: (signal: AbortSignal) => PromiseLike<T>) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PERSISTENCE_TIMEOUT_MS);
  try {
    const result = await operation(controller.signal);
    if (controller.signal.aborted) {
      throw new Error("La sauvegarde a dépassé le délai autorisé. Le brouillon est conservé.");
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("La sauvegarde a dépassé le délai autorisé. Le brouillon est conservé.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getBridgeOperationKind(type: string | undefined) {
  if (!type) return undefined;
  return BRIDGE_OPERATION_KINDS[type as keyof typeof BRIDGE_OPERATION_KINDS];
}

function getErrorMessage(error: Error) {
  const message = error.message || "La sauvegarde n’a pas pu être effectuée.";
  if (message.includes("FLOOR_PLAN_REVISION_CONFLICT") || message.includes("plan a été modifié")) {
    return "Ce plan a été modifié sur un autre écran. Annulez le brouillon puis actualisez avant de recommencer.";
  }
  if (message.includes("Table already occupied")) {
    const time = message.match(/around ([0-9:]+)/)?.[1];
    return `Cette table est déjà occupée${time ? ` autour de ${time}` : " à cette heure"}.`;
  }
  if (message.includes("Table capacity is too low")) return "Cette table n’a pas assez de places.";
  if (message.includes("Table is inactive")) return "Cette table est indisponible.";
  if (message.includes("A floor plan variant with this name already exists")) {
    return "Une variante porte déjà ce nom.";
  }
  if (message.includes("FLOOR_PLAN_REQUEST_ID_REUSED")) {
    return "Cette tentative ne correspond plus au brouillon courant. Relancez l’enregistrement.";
  }
  if (message.includes("Not allowed")) return "Vous n’avez pas l’autorisation de modifier cette salle.";
  return message;
}

function getStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} est invalide. Actualisez le plan avant de réessayer.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function getTableRowsRevision(rows: readonly TableRevisionRow[]) {
  return JSON.stringify(rows
    .map((row) => ({
      id: row.id,
      table_number: row.table_number,
      capacity: row.capacity,
      is_active: row.is_active,
      sector: row.sector,
      layout: row.layout,
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)));
}

function getServiceRowsRevision(tableRevision: string, rows: readonly LayoutOverrideRevisionRow[]) {
  return JSON.stringify({
    tables: JSON.parse(tableRevision) as unknown,
    overrides: rows
      .map((row) => ({
        id: row.id,
        reservation_table_id: row.reservation_table_id,
        service_date: row.service_date,
        layout: row.layout,
      }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
  });
}

function getSnapshotTableRevision(value: unknown) {
  if (!Array.isArray(value)) throw new Error("La réponse de sauvegarde du plan est invalide.");
  const rows = value.map((candidate): TableRevisionRow => {
    const row = asRecord(candidate);
    const invalidSnapshotMessage = "La réponse de sauvegarde du plan est invalide.";
    if (
      typeof row.id !== "string"
      || typeof row.table_number !== "string"
      || typeof row.capacity !== "number"
      || !Number.isFinite(row.capacity)
      || typeof row.layout === "undefined"
    ) {
      throw new Error("La réponse de sauvegarde du plan est invalide.");
    }
    const isActive = getNullableBoolean(row.is_active, invalidSnapshotMessage);
    const sector = getNullableString(row.sector, invalidSnapshotMessage);
    return {
      id: row.id,
      table_number: row.table_number,
      capacity: row.capacity,
      is_active: isActive,
      sector,
      layout: row.layout as Json,
    };
  });
  return getTableRowsRevision(rows);
}

function getSnapshotServiceRevision(value: unknown) {
  const snapshot = asRecord(value);
  if (!Array.isArray(snapshot.overrides)) {
    throw new Error("La réponse de sauvegarde du service est invalide.");
  }
  const overrides = snapshot.overrides.map((candidate): LayoutOverrideRevisionRow => {
    const row = asRecord(candidate);
    if (
      typeof row.id !== "string"
      || typeof row.reservation_table_id !== "string"
      || typeof row.service_date !== "string"
      || typeof row.layout === "undefined"
    ) {
      throw new Error("La réponse de sauvegarde du service est invalide.");
    }
    return {
      id: row.id,
      reservation_table_id: row.reservation_table_id,
      service_date: row.service_date,
      layout: row.layout as Json,
    };
  });
  return getServiceRowsRevision(getSnapshotTableRevision(snapshot.tables), overrides);
}

function getIdMap(value: unknown) {
  return Object.fromEntries(
    Object.entries(asRecord(value))
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function tablePositionChanged(left: FloorPlanV2Table, right: FloorPlanV2Table) {
  return Math.abs(left.x - right.x) > 0.05 || Math.abs(left.y - right.y) > 0.05;
}

function mapFloorPlanV2Variant(
  variant: FloorPlanVariantRow,
  existingRows: readonly TableRow[],
) {
  const snapshot = asRecord(variant.snapshot);
  const rows = Array.isArray(snapshot.tables) ? snapshot.tables : [];
  const usedExistingIds = new Set<string>();

  return rows.flatMap((candidate, index) => {
    const row = asRecord(candidate);
    const name = String(row.table_number || "").trim() || `Élément ${index + 1}`;
    const layout = asRecord(row.layout);
    const provisional = mapFloorPlanV2Table({
      id: `tmp_variant_${variant.id}_${index}`,
      table_number: name,
      capacity: Math.max(0, Math.round(Number(row.capacity) || 0)),
      is_active: row.is_active !== false,
      sector: typeof row.sector === "string" ? row.sector : "Salle principale",
      layout,
    }, index);
    const persistedId = typeof row.table_id === "string" ? row.table_id : "";
    const existingById = persistedId
      ? existingRows.find((existingRow, existingIndex) => (
        existingRow.id === persistedId
        && mapFloorPlanV2Table(existingRow, existingIndex).editable === provisional.editable
      ))
      : undefined;
    const existing = existingById || existingRows.find((existingRow, existingIndex) => {
      if (usedExistingIds.has(existingRow.id)) return false;
      if (existingRow.table_number.toLocaleLowerCase("fr") !== name.toLocaleLowerCase("fr")) return false;
      return mapFloorPlanV2Table(existingRow, existingIndex).editable === provisional.editable;
    });
    if (existing) usedExistingIds.add(existing.id);
    return [{
      ...provisional,
      id: existing?.id || `${provisional.editable ? "tmp_table" : "tmp_object"}_variant_${index}`,
    }];
  });
}

export default function DashboardPlanSalleV2() {
  const { selectedId, loading: restaurantsLoading } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [serviceDate, setServiceDate] = useState(getTodayReferenceDate());
  const [servicePeriod, setServicePeriod] = useState<FloorPlanV2Period>(() => (
    new Date().getHours() < 16 ? "midi" : "soir"
  ));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editorLocked, setEditorLocked] = useState(false);

  const {
    data: branches = [],
    isLoading: branchesLoading,
    error: branchesError,
    isRefetchError: branchesRefetchError,
  } = useQuery({
    queryKey: ["floor-plan-v2-branches", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_branches")
        .select("*")
        .eq("restaurant_id", selectedId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as BranchRow[];
    },
    enabled: Boolean(selectedId),
  });

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
    setIframeReady(false);
    setEditorLocked(false);
    setHasUnsavedChanges(false);
  }, [selectedBranchId, selectedId]);

  const {
    data: floorPlanVariants = [],
    isLoading: floorPlanVariantsLoading,
    error: floorPlanVariantsError,
    isRefetchError: floorPlanVariantsRefetchError,
  } = useQuery({
    queryKey: ["floor-plan-v2-variants", selectedBranchId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("floor_plan_variants" as any))
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FloorPlanVariantRow[];
    },
    enabled: Boolean(selectedBranchId),
  });

  const {
    data: tableRows = [],
    isLoading: tablesLoading,
    error: tablesError,
    isRefetchError: tablesRefetchError,
  } = useQuery({
    queryKey: ["floor-plan-v2-tables", selectedBranchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_tables")
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("table_number", { ascending: true });
      if (error) throw error;
      return (data || []) as TableRow[];
    },
    enabled: Boolean(selectedBranchId),
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const {
    data: layoutOverrides = [],
    isLoading: layoutOverridesLoading,
    error: layoutOverridesError,
    isRefetchError: layoutOverridesRefetchError,
  } = useQuery({
    queryKey: ["floor-plan-v2-layout-overrides", selectedBranchId, serviceDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_table_layout_overrides")
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .eq("service_date", serviceDate);
      if (error) throw error;
      return (data || []) as LayoutOverrideRow[];
    },
    enabled: Boolean(selectedBranchId),
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const {
    data: reservationRows = [],
    isLoading: reservationsLoading,
    error: reservationsError,
    isRefetchError: reservationsRefetchError,
  } = useQuery({
    queryKey: ["floor-plan-v2-reservations", selectedId, serviceDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("restaurant_id", selectedId!)
        .eq("date", serviceDate)
        .order("time", { ascending: true })
        .limit(500);
      if (error) throw error;
      if (!data?.length) return [] as ReservationWithCustomer[];

      const { data: profilesData, error: profilesError } = await supabase.rpc(
        "get_reservation_customers",
        { p_restaurant_id: selectedId! },
      );
      if (profilesError) throw profilesError;
      const profilesByUserId = new Map(
        ((profilesData || []) as Array<{ user_id: string; full_name: string | null }>).map((profile) => [
          profile.user_id,
          { full_name: profile.full_name },
        ]),
      );

      return data.map((reservation) => ({
        ...reservation,
        customer: profilesByUserId.get(reservation.user_id) || null,
      })) as ReservationWithCustomer[];
    },
    enabled: Boolean(selectedId),
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const tableIds = useMemo(() => tableRows
    .filter((table, index) => mapFloorPlanV2Table(table, index).editable)
    .map((table) => table.id), [tableRows]);
  const reservationIds = useMemo(() => reservationRows
    .filter((reservation) => !reservation.branch_id || reservation.branch_id === selectedBranchId)
    .map((reservation) => reservation.id), [reservationRows, selectedBranchId]);
  const {
    data: slotRows = [],
    isLoading: slotsLoading,
    error: slotsError,
    isRefetchError: slotsRefetchError,
  } = useQuery({
    queryKey: [
      "floor-plan-v2-slots",
      selectedBranchId,
      tableIds.join(","),
      reservationIds.join(","),
    ],
    queryFn: async () => {
      const chunks = Array.from(
        { length: Math.ceil(reservationIds.length / 100) },
        (_, index) => reservationIds.slice(index * 100, (index + 1) * 100),
      );
      const responses = await Promise.all(chunks.map((reservationIdChunk) => (
        supabase
          .from("reservation_slots")
          .select("*")
          .in("reservation_id", reservationIdChunk)
      )));
      const failed = responses.find((response) => response.error);
      if (failed?.error) throw failed.error;
      const allowedTableIds = new Set(tableIds);
      return responses
        .flatMap((response) => (response.data || []) as SlotRow[])
        .filter((slot) => allowedTableIds.has(slot.table_id));
    },
    enabled: Boolean(selectedBranchId) && tableIds.length > 0 && reservationIds.length > 0,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const slotsByReservationId = useMemo(
    () => new Map(slotRows.map((slot) => [slot.reservation_id, slot.table_id])),
    [slotRows],
  );
  const overridesByTableId = useMemo(
    () => new Map(layoutOverrides.map((override) => [override.reservation_table_id, override.layout])),
    [layoutOverrides],
  );
  const templateTables = useMemo(
    () => tableRows.map((table, index) => mapFloorPlanV2Table(table, index)),
    [tableRows],
  );
  const serviceTables = useMemo(
    () => tableRows.map((table, index) => (
      mapFloorPlanV2Table(table, index, overridesByTableId.get(table.id))
    )),
    [overridesByTableId, tableRows],
  );
  const furnitureObjects = useMemo(
    () => templateTables.filter((item) => !item.editable),
    [templateTables],
  );
  const allReservations = useMemo(() => reservationRows
    .filter((reservation) => !reservation.branch_id || reservation.branch_id === selectedBranchId)
    .map((reservation) => toFloorPlanV2Reservation(
      reservation,
      slotsByReservationId.get(reservation.id) || null,
    )), [reservationRows, selectedBranchId, slotsByReservationId]);
  const visibleReservations = useMemo(() => allReservations.filter((reservation) => (
    reservation.period === servicePeriod
    && !RELEASED_STATUSES.has(reservation.status.toLowerCase())
  )), [allReservations, servicePeriod]);
  const assignments = useMemo(
    () => buildFloorPlanV2Assignments(allReservations),
    [allReservations],
  );
  const placementRecommendations = useMemo(() => Object.fromEntries(
    visibleReservations
      .filter((reservation) => !reservation.tableId)
      .map((reservation) => [
        reservation.id,
        getFloorPlanV2ReservationRecommendation({
          reservation,
          allReservations,
          tables: serviceTables,
          assignments,
        }),
      ])
      .filter((entry) => entry[1] !== null),
  ), [allReservations, assignments, serviceTables, visibleReservations]);
  const templateRevision = useMemo(() => getTableRowsRevision(tableRows), [tableRows]);
  const serviceRevision = useMemo(
    () => getServiceRowsRevision(templateRevision, layoutOverrides),
    [layoutOverrides, templateRevision],
  );
  const hasBlockingError = Boolean(
    (branchesError && !branchesRefetchError)
    || (floorPlanVariantsError && !floorPlanVariantsRefetchError)
    || (tablesError && !tablesRefetchError)
    || (layoutOverridesError && !layoutOverridesRefetchError)
    || (reservationsError && !reservationsRefetchError)
    || (slotsError && !slotsRefetchError),
  );
  const hasRefetchError = Boolean(
    branchesRefetchError
    || floorPlanVariantsRefetchError
    || tablesRefetchError
    || layoutOverridesRefetchError
    || reservationsRefetchError
    || slotsRefetchError,
  );
  const loading = restaurantsLoading
    || branchesLoading
    || floorPlanVariantsLoading
    || tablesLoading
    || layoutOverridesLoading
    || reservationsLoading
    || (tableIds.length > 0 && reservationIds.length > 0 && slotsLoading);
  const workspaceMounted = Boolean(selectedId && selectedBranchId && !loading && !hasBlockingError);
  const workspaceReady = workspaceMounted && !hasRefetchError;

  const sendToIframe = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "tok-dashboard", type, payload },
      window.location.origin,
    );
  }, []);

  const sendHydrate = useCallback(() => {
    if (!selectedBranchId || !workspaceReady) return;
    sendToIframe("tok-table-v2:hydrate", {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      branchId: selectedBranchId,
      selectedDate: serviceDate,
      selectedPeriod: servicePeriod,
      templateTables: templateTables.filter((item) => item.editable),
      serviceTables: serviceTables.filter((item) => item.editable),
      tables: serviceTables.filter((item) => item.editable),
      furniture: furnitureObjects,
      reservations: visibleReservations,
      recommendations: placementRecommendations,
      variants: floorPlanVariants.map((variant) => ({ id: variant.id, name: variant.name })),
      templateRevision,
      serviceRevision,
    });
  }, [
    selectedBranchId,
    sendToIframe,
    serviceDate,
    servicePeriod,
    serviceTables,
    templateTables,
    furnitureObjects,
    floorPlanVariants,
    placementRecommendations,
    serviceRevision,
    templateRevision,
    visibleReservations,
    workspaceReady,
  ]);

  useEffect(() => {
    sendHydrate();
  }, [sendHydrate]);

  const assignmentMutation = useMutation({
    mutationFn: async ({ assignments: changes }: AssignmentRequest) => {
      if (!selectedBranchId || !workspaceReady) {
        throw new Error("La synchronisation est temporairement indisponible. Le brouillon est conservé.");
      }
      const nextAssignments = { ...assignments };
      for (const [reservationId, tableId] of Object.entries(changes)) {
        const validationError = getFloorPlanV2AssignmentError({
          reservationId,
          tableId,
          reservations: allReservations,
          tables: serviceTables,
          assignments: nextAssignments,
        });
        if (validationError) throw new Error(validationError);
        nextAssignments[reservationId] = tableId;
      }

      const { error } = await withPersistenceTimeout((signal) => (
        supabase.rpc("restaurant_save_floor_plan_assignments", {
          p_branch_id: selectedBranchId,
          p_assignments: changes as Json,
          p_reason: "Placement depuis Plan de salle 2",
        }).abortSignal(signal)
      ));
      if (error) throw error;
    },
    onMutate: (request) => {
      sendToIframe("tok-table-v2:operation-start", { requestId: request.requestId, kind: "assignment" });
    },
    onSuccess: async (_data, request) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-slots", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-slots", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] }),
      ]);
      await queryClient.refetchQueries({ queryKey: ["floor-plan-v2-slots", selectedBranchId] });
      sendToIframe("tok-table-v2:operation-success", {
        requestId: request.requestId,
        kind: "assignment",
        message: request.successMessage,
      });
      toast({ title: "Plan synchronisé", description: request.successMessage });
    },
    onError: (error: Error, request) => {
      const message = getErrorMessage(error);
      sendToIframe("tok-table-v2:operation-error", {
        requestId: request.requestId,
        kind: "assignment",
        message,
      });
      window.setTimeout(sendHydrate, 0);
      toast({ title: "Placement refusé", description: message, variant: "destructive" });
    },
  });

  const reservationStatusMutation = useMutation({
    mutationFn: async ({ reservationId, status }: ReservationStatusRequest) => {
      if (!workspaceReady) {
        throw new Error("La synchronisation est temporairement indisponible. Le brouillon est conservé.");
      }
      if (!EDITABLE_RESERVATION_STATUSES.has(status)) {
        throw new Error("Ce statut de réservation n’est pas autorisé.");
      }
      if (!allReservations.some((reservation) => reservation.id === reservationId)) {
        throw new Error("Réservation introuvable pour ce restaurant.");
      }
      const result = await updateRestaurantReservationStatus(reservationId, status);
      if (!result.ok) throw new Error(result.errorMessage || "Mise à jour impossible.");
    },
    onMutate: (request) => {
      sendToIframe("tok-table-v2:operation-start", {
        requestId: request.requestId,
        kind: "reservation-status",
      });
    },
    onSuccess: async (_data, request) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-reservations", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] }),
      ]);
      await queryClient.refetchQueries({ queryKey: ["floor-plan-v2-reservations", selectedId] });
      sendToIframe("tok-table-v2:operation-success", {
        requestId: request.requestId,
        kind: "reservation-status",
        message: "Le statut de la réservation est à jour.",
      });
      toast({ title: "Statut mis à jour", description: "Le service a été synchronisé." });
    },
    onError: (error: Error, request) => {
      const message = getErrorMessage(error);
      sendToIframe("tok-table-v2:operation-error", {
        requestId: request.requestId,
        kind: "reservation-status",
        message,
      });
      window.setTimeout(sendHydrate, 0);
      toast({ title: "Statut non modifié", description: message, variant: "destructive" });
    },
  });

  const templateMutation = useMutation({
    mutationFn: async ({
      protocolVersion,
      baseRevision,
      rawTables,
      rawObjects,
      baselineTableIds,
      baselineObjectIds,
      requestId,
    }: TableSaveRequest): Promise<TemplateSaveResult> => {
      if (!selectedBranchId || !workspaceReady) throw new Error("Le plan n’est pas encore prêt.");
      if (protocolVersion !== BRIDGE_PROTOCOL_VERSION || !Array.isArray(rawObjects)) {
        throw new Error("Version du plan incompatible. Actualisez la page avant d’enregistrer.");
      }
      if (baseRevision !== templateRevision) {
        throw new Error("FLOOR_PLAN_REVISION_CONFLICT: le plan a été modifié depuis son chargement.");
      }
      const drafts = parseFloorPlanV2TableDrafts(rawTables);
      const objectDrafts = parseFloorPlanV2ObjectDrafts(rawObjects);
      const baselineTables = getStringArray(baselineTableIds, "La liste initiale des tables");
      const baselineObjects = getStringArray(baselineObjectIds, "La liste initiale du mobilier");
      const existingEditableRows = tableRows.filter((row, index) => mapFloorPlanV2Table(row, index).editable);
      const existingRowsById = new Map(existingEditableRows.map((row) => [row.id, row]));
      const requestedExistingIds = new Set<string>();

      const upserts = drafts.map((draft, draftIndex) => {
        const existing = existingRowsById.get(draft.id);
        if (!existing && !draft.id.startsWith("tmp_")) {
          throw new Error("Une table du brouillon n’appartient plus à cette salle. Actualisez le plan.");
        }
        if (existing) requestedExistingIds.add(existing.id);
        const fallbackIndex = existing
          ? tableRows.findIndex((row) => row.id === existing.id)
          : tableRows.length + draftIndex;
        return {
          client_id: draft.id,
          id: existing?.id || null,
          table_number: draft.name,
          capacity: draft.capacity,
          is_active: !draft.blocked,
          sector: draft.zone,
          layout: serializeFloorPlanV2Layout(draft, existing?.layout, fallbackIndex) as Json,
        };
      });
      const deleteIds = baselineTables.filter((id) => (
        existingRowsById.has(id) && !requestedExistingIds.has(id)
      ));

      const existingFurnitureRows = tableRows.filter(
        (row, index) => !mapFloorPlanV2Table(row, index).editable,
      );
      const existingFurnitureRowsById = new Map(existingFurnitureRows.map((row) => [row.id, row]));
      const requestedExistingFurnitureIds = new Set<string>();
      const objectUpserts = objectDrafts.map((object) => {
        const existing = existingFurnitureRowsById.get(object.id);
        if (!existing && !object.id.startsWith("tmp_")) {
          throw new Error("Un objet du brouillon n’appartient plus à cette salle. Actualisez le plan.");
        }
        if (existing) requestedExistingFurnitureIds.add(existing.id);
        return {
          client_id: object.id,
          id: existing?.id || null,
          table_number: object.name,
          capacity: 0,
          is_active: true,
          sector: object.zone,
          layout: serializeFloorPlanV2Object(object, existing?.layout) as Json,
        };
      });
      const objectDeleteIds = baselineObjects.filter((id) => (
        existingFurnitureRowsById.has(id) && !requestedExistingFurnitureIds.has(id)
      ));

      const { data, error } = await withPersistenceTimeout((signal) => (
        supabase.rpc("restaurant_save_floor_plan_workspace_v2", {
          p_branch_id: selectedBranchId,
          p_expected_snapshot: JSON.parse(baseRevision) as Json,
          p_request_id: getOperationId(requestId),
          p_table_upserts: upserts as Json,
          p_table_delete_ids: deleteIds,
          p_objects: objectUpserts as Json,
          p_object_delete_ids: objectDeleteIds,
          p_reason: "Modèle et mobilier enregistrés depuis Plan de salle 2",
        }).abortSignal(signal)
      ));
      if (error) throw error;
      const response = asRecord(data);
      return {
        idMap: getIdMap(response.id_map),
        serverRevision: getSnapshotTableRevision(response.snapshot),
      };
    },
    onMutate: (request) => {
      sendToIframe("tok-table-v2:operation-start", { requestId: request.requestId, kind: "template" });
    },
    onSuccess: async (result, request) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-tables", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-layout-overrides", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-slots", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-tables", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-layout-overrides", selectedBranchId] }),
      ]);
      await queryClient.refetchQueries({ queryKey: ["floor-plan-v2-tables", selectedBranchId] });
      const savedRows = queryClient.getQueryData<TableRow[]>(["floor-plan-v2-tables", selectedBranchId]) || [];
      const currentRevision = getTableRowsRevision(savedRows);
      if (currentRevision !== result.serverRevision) {
        const message = "Le plan a changé après cette sauvegarde. Votre brouillon est conservé : actualisez avant de continuer.";
        setHasUnsavedChanges(true);
        sendToIframe("tok-table-v2:operation-error", {
          requestId: request.requestId,
          kind: "template",
          message,
        });
        toast({ title: "Plan modifié ailleurs", description: message, variant: "destructive" });
        return;
      }
      setHasUnsavedChanges(false);
      sendToIframe("tok-table-v2:operation-success", {
        requestId: request.requestId,
        kind: "template",
        idMap: result.idMap,
        templateRevision: currentRevision,
        message: "Le modèle de salle est enregistré.",
      });
      toast({ title: "Modèle enregistré", description: "La V1 et la V2 utilisent maintenant cette configuration." });
    },
    onError: (error: Error, request) => {
      const message = getErrorMessage(error);
      sendToIframe("tok-table-v2:operation-error", {
        requestId: request.requestId,
        kind: "template",
        message,
      });
      toast({ title: "Modèle non enregistré", description: message, variant: "destructive" });
    },
  });

  const variantMutation = useMutation({
    mutationFn: async ({ protocolVersion, name, rawTables, rawObjects, requestId }: VariantSaveRequest) => {
      if (!selectedId || !selectedBranchId || !workspaceReady) throw new Error("Le plan n’est pas encore prêt.");
      if (protocolVersion !== BRIDGE_PROTOCOL_VERSION || !Array.isArray(rawObjects)) {
        throw new Error("Version du plan incompatible. Actualisez la page avant d’enregistrer.");
      }
      const variantName = name.trim();
      if (!variantName || variantName.length > 80) throw new Error("Donnez un nom valide à cette variante.");
      const drafts = parseFloorPlanV2TableDrafts(rawTables);
      const objectDrafts = parseFloorPlanV2ObjectDrafts(rawObjects);
      const existingRowsById = new Map(tableRows.map((row) => [row.id, row]));
      const snapshotTables = [
        ...drafts.map((draft, index) => {
          const existing = existingRowsById.get(draft.id);
          return {
            table_id: existing?.id || null,
            client_id: draft.id,
            table_number: draft.name,
            capacity: draft.capacity,
            is_active: !draft.blocked,
            sector: draft.zone,
            layout: serializeFloorPlanV2Layout(draft, existing?.layout, index),
          };
        }),
        ...objectDrafts.map((object) => {
          const existing = existingRowsById.get(object.id);
          return {
            table_id: existing?.id || null,
            client_id: object.id,
            table_number: object.name,
            capacity: 0,
            is_active: true,
            sector: object.zone,
            layout: serializeFloorPlanV2Object(object, existing?.layout),
          };
        }),
      ];
      const snapshot = {
        version: 1,
        canvas: { width: 1040, height: 760 },
        tables: snapshotTables,
      };
      const { data, error } = await withPersistenceTimeout((signal) => (
        supabase.rpc("restaurant_save_floor_plan_variant_v2", {
          p_branch_id: selectedBranchId,
          p_request_id: getOperationId(requestId),
          p_name: variantName,
          p_snapshot: snapshot as Json,
          p_source: "manual",
        }).abortSignal(signal)
      ));
      if (error) throw error;
      const variant = asRecord(asRecord(data).variant);
      if (typeof variant.id !== "string" || typeof variant.name !== "string") {
        throw new Error("La réponse de sauvegarde de la variante est invalide.");
      }
      return variant as FloorPlanVariantRow;
    },
    onMutate: (request) => {
      sendToIframe("tok-table-v2:operation-start", { requestId: request.requestId, kind: "variant" });
    },
    onSuccess: async (variant, request) => {
      await queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-variants", selectedBranchId] });
      await queryClient.refetchQueries({ queryKey: ["floor-plan-v2-variants", selectedBranchId] });
      sendToIframe("tok-table-v2:operation-success", {
        requestId: request.requestId,
        kind: "variant",
        variantId: variant.id,
        message: `La variante « ${variant.name} » est enregistrée.`,
      });
      toast({ title: "Variante enregistrée", description: variant.name });
    },
    onError: (error: Error, request) => {
      const message = getErrorMessage(error);
      sendToIframe("tok-table-v2:operation-error", {
        requestId: request.requestId,
        kind: "variant",
        message,
      });
      toast({ title: "Variante non enregistrée", description: message, variant: "destructive" });
    },
  });

  const serviceLayoutMutation = useMutation({
    mutationFn: async ({ protocolVersion, baseRevision, rawTables, requestId }: TableSaveRequest) => {
      if (!selectedBranchId || !workspaceReady) throw new Error("Le plan n’est pas encore prêt.");
      if (protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
        throw new Error("Version du plan incompatible. Actualisez la page avant d’enregistrer.");
      }
      if (baseRevision !== serviceRevision) {
        throw new Error("FLOOR_PLAN_REVISION_CONFLICT: le plan a été modifié depuis son chargement.");
      }
      const drafts = parseFloorPlanV2TableDrafts(rawTables);
      const templateById = new Map(templateTables.filter((table) => table.editable).map((table) => [table.id, table]));
      const serviceById = new Map(serviceTables.filter((table) => table.editable).map((table) => [table.id, table]));
      const rowById = new Map(tableRows.map((row) => [row.id, row]));
      const overrideById = new Map(layoutOverrides.map((override) => [override.reservation_table_id, override]));

      if (drafts.length !== templateById.size) {
        throw new Error("La salle a changé depuis son chargement. Actualisez avant d’enregistrer.");
      }

      const layouts = drafts.map((draft) => {
        const template = templateById.get(draft.id);
        const service = serviceById.get(draft.id);
        const row = rowById.get(draft.id);
        if (!template || !service || !row) throw new Error("Table introuvable dans cette salle.");
        if (
          draft.name !== service.name
          || draft.capacity !== service.capacity
          || draft.zone !== service.zone
          || draft.shape !== service.shape
          || draft.blocked !== service.blocked
        ) {
          throw new Error("En mode Service, seule la position des tables peut être modifiée.");
        }

        const override = overrideById.get(draft.id);
        const hasExistingOverride = Boolean(override);
        const unchangedFromTemplate = !tablePositionChanged(draft, template);
        const mergedLayout = {
          ...asRecord(row.layout),
          ...asRecord(override?.layout),
        };
        return {
          table_id: draft.id,
          layout: unchangedFromTemplate && !hasExistingOverride
            ? null
            : serializeFloorPlanV2Layout(draft, mergedLayout, tableRows.findIndex((item) => item.id === draft.id)),
        };
      });

      const { data, error } = await withPersistenceTimeout((signal) => (
        supabase.rpc("restaurant_save_floor_plan_layouts_v2", {
          p_branch_id: selectedBranchId,
          p_expected_snapshot: JSON.parse(baseRevision) as Json,
          p_request_id: getOperationId(requestId),
          p_service_date: serviceDate,
          p_layouts: layouts as Json,
          p_reason: "Disposition du service enregistrée depuis Plan de salle 2",
        }).abortSignal(signal)
      ));
      if (error) throw error;
      return { serverRevision: getSnapshotServiceRevision(asRecord(data).snapshot) } as ServiceSaveResult;
    },
    onMutate: (request) => {
      sendToIframe("tok-table-v2:operation-start", { requestId: request.requestId, kind: "service-layout" });
    },
    onSuccess: async (result, request) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-layout-overrides", selectedBranchId, serviceDate] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-layout-overrides", selectedBranchId, serviceDate] }),
      ]);
      await queryClient.refetchQueries({
        queryKey: ["floor-plan-v2-layout-overrides", selectedBranchId, serviceDate],
      });
      const savedOverrides = queryClient.getQueryData<LayoutOverrideRow[]>([
        "floor-plan-v2-layout-overrides",
        selectedBranchId,
        serviceDate,
      ]) || [];
      const savedRows = queryClient.getQueryData<TableRow[]>(["floor-plan-v2-tables", selectedBranchId]) || tableRows;
      const currentRevision = getServiceRowsRevision(getTableRowsRevision(savedRows), savedOverrides);
      if (currentRevision !== result.serverRevision) {
        const message = "La disposition a changé après cette sauvegarde. Votre brouillon est conservé : actualisez avant de continuer.";
        setHasUnsavedChanges(true);
        sendToIframe("tok-table-v2:operation-error", {
          requestId: request.requestId,
          kind: "service-layout",
          message,
        });
        toast({ title: "Disposition modifiée ailleurs", description: message, variant: "destructive" });
        return;
      }
      setHasUnsavedChanges(false);
      sendToIframe("tok-table-v2:operation-success", {
        requestId: request.requestId,
        kind: "service-layout",
        serviceRevision: currentRevision,
        message: "La disposition de ce service est enregistrée.",
      });
      toast({ title: "Disposition enregistrée", description: `Le plan du ${serviceDate} est à jour.` });
    },
    onError: (error: Error, request) => {
      const message = getErrorMessage(error);
      sendToIframe("tok-table-v2:operation-error", {
        requestId: request.requestId,
        kind: "service-layout",
        message,
      });
      toast({ title: "Disposition non enregistrée", description: message, variant: "destructive" });
    },
  });

  const autoPlace = useCallback((requestId: string) => {
    const result = computeFloorPlanV2AutoAssignments({
      visibleReservations,
      allReservations,
      tables: serviceTables,
      assignments,
    });
    if (!result.placedReservationIds.length) {
      sendToIframe("tok-table-v2:operation-error", {
        requestId,
        kind: "assignment",
        message: "Aucun placement supplémentaire n’est possible.",
      });
      return;
    }
    assignmentMutation.mutate({
      requestId,
      assignments: result.changedAssignments,
      successMessage: `${result.placedReservationIds.length} réservation(s) placée(s) automatiquement.`,
    });
  }, [allReservations, assignmentMutation, assignments, sendToIframe, serviceTables, visibleReservations]);

  const operationPending = assignmentMutation.isPending
    || reservationStatusMutation.isPending
    || templateMutation.isPending
    || variantMutation.isPending
    || serviceLayoutMutation.isPending;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data as {
        source?: string;
        type?: string;
        payload?: Record<string, unknown>;
      };
      if (message?.source !== "tok-table-v2") return;

      if (message.type === "tok-table-v2:ready") {
        setIframeReady(true);
        window.setTimeout(sendHydrate, 0);
        return;
      }
      if (message.type === "tok-table-v2:editor-lock") {
        setEditorLocked(message.payload?.locked === true);
        return;
      }
      if (message.type === "tok-table-v2:dirty-change") {
        setHasUnsavedChanges(message.payload?.dirty === true);
        return;
      }
      if (message.type === "tok-table-v2:service-change") {
        const date = String(message.payload?.date || "");
        const period = message.payload?.period;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) setServiceDate(date);
        if (period === "midi" || period === "soir") setServicePeriod(period);
        return;
      }

      const requestId = getOperationId(message.payload?.requestId);
      const operationKind = getBridgeOperationKind(message.type);
      if (operationPending) {
        if (!operationKind) return;
        sendToIframe("tok-table-v2:operation-error", {
          requestId,
          kind: operationKind,
          message: "Une sauvegarde est déjà en cours.",
        });
        return;
      }
      if (!workspaceReady) {
        if (!operationKind) return;
        sendToIframe("tok-table-v2:operation-error", {
          requestId,
          kind: operationKind,
          message: "La synchronisation est temporairement indisponible. Le brouillon est conservé.",
        });
        return;
      }
      if (message.type === "tok-table-v2:assign") {
        const reservationId = String(message.payload?.reservationId || "");
        const tableIdValue = message.payload?.tableId;
        const tableId = typeof tableIdValue === "string" && tableIdValue ? tableIdValue : null;
        if (!reservationId) return;
        assignmentMutation.mutate({
          requestId,
          assignments: { [reservationId]: tableId },
          successMessage: tableId ? "Le client a été placé." : "Le placement a été retiré.",
        });
        return;
      }
      if (message.type === "tok-table-v2:update-reservation-status") {
        const reservationId = String(message.payload?.reservationId || "");
        const status = String(message.payload?.status || "").toLowerCase();
        if (!reservationId || !EDITABLE_RESERVATION_STATUSES.has(status)) return;
        reservationStatusMutation.mutate({ requestId, reservationId, status });
        return;
      }
      if (message.type === "tok-table-v2:auto-place-request") {
        autoPlace(requestId);
        return;
      }
      if (message.type === "tok-table-v2:load-variant") {
        const variantId = String(message.payload?.variantId || "");
        const variant = floorPlanVariants.find((item) => item.id === variantId);
        const items = variant ? mapFloorPlanV2Variant(variant, tableRows) : [];
        if (!variant || !items.some((item) => item.editable)) {
          sendToIframe("tok-table-v2:operation-error", {
            requestId,
            kind: "variant-load",
            message: "Cette variante est introuvable ou vide.",
          });
          return;
        }
        sendToIframe("tok-table-v2:operation-success", {
          requestId,
          kind: "variant-load",
          variantId,
          tables: items.filter((item) => item.editable),
          furniture: items.filter((item) => !item.editable),
          message: `La variante « ${variant.name} » est chargée comme brouillon.`,
        });
        return;
      }
      if (message.type === "tok-table-v2:save-variant") {
        variantMutation.mutate({
          requestId,
          protocolVersion: Number(message.payload?.protocolVersion),
          name: String(message.payload?.name || ""),
          rawTables: message.payload?.tables,
          rawObjects: message.payload?.objects,
        });
        return;
      }
      if (message.type === "tok-table-v2:save-template") {
        templateMutation.mutate({
          requestId,
          protocolVersion: Number(message.payload?.protocolVersion),
          baseRevision: String(message.payload?.baseRevision || ""),
          rawTables: message.payload?.tables,
          rawObjects: message.payload?.objects,
          baselineTableIds: message.payload?.baselineTableIds,
          baselineObjectIds: message.payload?.baselineObjectIds,
        });
        return;
      }
      if (message.type === "tok-table-v2:save-service-layout") {
        serviceLayoutMutation.mutate({
          requestId,
          protocolVersion: Number(message.payload?.protocolVersion),
          baseRevision: String(message.payload?.baseRevision || ""),
          rawTables: message.payload?.tables,
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    assignmentMutation,
    autoPlace,
    floorPlanVariants,
    sendHydrate,
    operationPending,
    reservationStatusMutation,
    sendToIframe,
    serviceLayoutMutation,
    templateMutation,
    tableRows,
    variantMutation,
    workspaceReady,
  ]);

  const openFullscreen = async () => {
    try {
      await fullscreenRef.current?.requestFullscreen();
    } catch {
      toast({ title: "Plein écran indisponible", description: "Le navigateur a refusé le plein écran." });
    }
  };

  return (
    <DashboardLayout contentWidth="full" mainClassName="p-2 pb-24 sm:p-3 md:p-4">
      <section className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold">Plan de salle 2</h1>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100">
                  Données réelles
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tables, modèle et placements sont partagés avec la V1 et enregistrés dans TOK.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {branches.length > 1 ? (
              <Select
                value={selectedBranchId || ""}
                onValueChange={setSelectedBranchId}
                disabled={!workspaceReady || hasUnsavedChanges || editorLocked || operationPending}
              >
                <SelectTrigger className="h-9 w-[180px] rounded-xl">
                  <SelectValue placeholder="Salle" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sendHydrate}
              disabled={!workspaceReady || !iframeReady || hasUnsavedChanges || editorLocked || operationPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openFullscreen}>
              <Expand className="mr-2 h-4 w-4" />
              Plein écran
            </Button>
          </div>
        </div>

        {hasBlockingError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Les données réelles n’ont pas pu être chargées. Réessayez dans un instant.
          </div>
        ) : null}

        {hasRefetchError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            La dernière version chargée reste affichée. La synchronisation et les enregistrements sont suspendus
            jusqu’au retour de la connexion ; votre brouillon est conservé.
          </div>
        ) : null}

        {!selectedId && !restaurantsLoading ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Sélectionnez un restaurant pour charger ses clients et ses tables.
          </div>
        ) : null}

        {selectedId && !branchesLoading && branches.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Créez d’abord une salle pour utiliser le plan de table.
          </div>
        ) : null}

        {selectedId && selectedBranchId ? (
          <div
            ref={fullscreenRef}
            className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white shadow-sm [&:fullscreen>iframe]:h-screen [&:fullscreen>iframe]:min-h-0"
          >
            {!workspaceMounted ? (
              <div className="flex h-[calc(100vh-11rem)] min-h-[760px] items-center justify-center gap-2 bg-background/95 px-3 py-2 text-sm text-muted-foreground backdrop-blur">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {hasBlockingError ? "Le plan est indisponible tant que les données ne sont pas chargées." : "Chargement sécurisé du plan, des clients et des placements…"}
              </div>
            ) : null}
            {workspaceMounted ? (
              <iframe
                key={`${selectedId}:${selectedBranchId}`}
                ref={iframeRef}
                src={PROTOTYPE_URL}
                title="TOK TABLE 2 connecté"
                className="h-[calc(100vh-11rem)] min-h-[760px] w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                allow="fullscreen"
                allowFullScreen
                onLoad={() => {
                  setIframeReady(true);
                  window.setTimeout(sendHydrate, 0);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </DashboardLayout>
  );
}
