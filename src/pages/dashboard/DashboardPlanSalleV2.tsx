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
  mapFloorPlanV2Table,
  type FloorPlanV2Period,
  type FloorPlanV2Reservation,
} from "@/lib/floorPlanV2";
import { getServicePeriodFromMetadata } from "@/lib/serviceSettings";

import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();
const PROTOTYPE_URL = "/tok-table-v2/index.html?connected=1";
const RELEASED_STATUSES = new Set(["cancelled", "canceled", "no_show", "completed", "archived"]);

type BranchRow = Database["public"]["Tables"]["restaurant_branches"]["Row"];
type TableRow = Database["public"]["Tables"]["reservation_tables"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type SlotRow = Database["public"]["Tables"]["reservation_slots"]["Row"];
type LayoutOverrideRow = Database["public"]["Tables"]["reservation_table_layout_overrides"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReservationWithCustomer = ReservationRow & {
  customer: Pick<ProfileRow, "full_name"> | null;
};

type AssignmentRequest = {
  assignments: Record<string, string | null>;
  successMessage: string;
};

function asRecord(value: Json | null | undefined): Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
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
  };
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

  const { data: branches = [], isLoading: branchesLoading, error: branchesError } = useQuery({
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

  const { data: tableRows = [], isLoading: tablesLoading, error: tablesError } = useQuery({
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
  });

  const { data: layoutOverrides = [], error: layoutOverridesError } = useQuery({
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
  });

  const { data: reservationRows = [], isLoading: reservationsLoading, error: reservationsError } = useQuery({
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
  });

  const tableIds = useMemo(() => tableRows.map((table) => table.id), [tableRows]);
  const { data: slotRows = [], error: slotsError } = useQuery({
    queryKey: ["floor-plan-v2-slots", selectedBranchId, tableIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_slots")
        .select("*")
        .in("table_id", tableIds);
      if (error) throw error;
      return (data || []) as SlotRow[];
    },
    enabled: Boolean(selectedBranchId) && tableIds.length > 0,
  });

  const slotsByReservationId = useMemo(
    () => new Map(slotRows.map((slot) => [slot.reservation_id, slot.table_id])),
    [slotRows],
  );
  const overridesByTableId = useMemo(
    () => new Map(layoutOverrides.map((override) => [override.reservation_table_id, override.layout])),
    [layoutOverrides],
  );
  const tables = useMemo(
    () => tableRows.map((table, index) => (
      mapFloorPlanV2Table(table, index, overridesByTableId.get(table.id))
    )),
    [overridesByTableId, tableRows],
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

  const sendToIframe = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "tok-dashboard", type, payload },
      window.location.origin,
    );
  }, []);

  const sendHydrate = useCallback(() => {
    if (!iframeReady || !selectedBranchId) return;
    sendToIframe("tok-table-v2:hydrate", {
      branchId: selectedBranchId,
      selectedDate: serviceDate,
      selectedPeriod: servicePeriod,
      tables,
      reservations: visibleReservations,
    });
  }, [iframeReady, selectedBranchId, sendToIframe, serviceDate, servicePeriod, tables, visibleReservations]);

  useEffect(() => {
    sendHydrate();
  }, [sendHydrate]);

  const assignmentMutation = useMutation({
    mutationFn: async ({ assignments: changes }: AssignmentRequest) => {
      if (!selectedBranchId) throw new Error("Aucune salle sélectionnée.");
      const nextAssignments = { ...assignments };
      for (const [reservationId, tableId] of Object.entries(changes)) {
        const error = getFloorPlanV2AssignmentError({
          reservationId,
          tableId,
          reservations: allReservations,
          tables,
          assignments: nextAssignments,
        });
        if (error) throw new Error(error);
        nextAssignments[reservationId] = tableId;
      }

      const { error } = await (supabase.rpc as any)("restaurant_save_floor_plan_assignments", {
        p_branch_id: selectedBranchId,
        p_assignments: changes,
        p_reason: "Placement depuis Plan de salle 2",
      });
      if (error) throw error;
    },
    onMutate: () => {
      sendToIframe("tok-table-v2:saving");
    },
    onSuccess: async (_data, request) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["floor-plan-v2-slots", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["floor-plan-slots", selectedBranchId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] }),
      ]);
      await queryClient.refetchQueries({ queryKey: ["floor-plan-v2-slots", selectedBranchId] });
      sendToIframe("tok-table-v2:saved", { message: request.successMessage });
      toast({ title: "Plan synchronisé", description: request.successMessage });
    },
    onError: (error: Error) => {
      sendToIframe("tok-table-v2:error", { message: error.message });
      window.setTimeout(sendHydrate, 0);
      toast({ title: "Placement refusé", description: error.message, variant: "destructive" });
    },
  });

  const autoPlace = useCallback(() => {
    const result = computeFloorPlanV2AutoAssignments({
      visibleReservations,
      allReservations,
      tables,
      assignments,
    });
    if (!result.placedReservationIds.length) {
      sendToIframe("tok-table-v2:error", { message: "Aucun placement supplémentaire n’est possible." });
      return;
    }
    assignmentMutation.mutate({
      assignments: result.changedAssignments,
      successMessage: `${result.placedReservationIds.length} réservation(s) placée(s) automatiquement.`,
    });
  }, [allReservations, assignmentMutation, assignments, sendToIframe, tables, visibleReservations]);

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
        return;
      }
      if (message.type === "tok-table-v2:service-change") {
        const date = String(message.payload?.date || "");
        const period = message.payload?.period;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) setServiceDate(date);
        if (period === "midi" || period === "soir") setServicePeriod(period);
        return;
      }
      if (message.type === "tok-table-v2:assign") {
        const reservationId = String(message.payload?.reservationId || "");
        const tableIdValue = message.payload?.tableId;
        const tableId = typeof tableIdValue === "string" && tableIdValue ? tableIdValue : null;
        if (!reservationId) return;
        assignmentMutation.mutate({
          assignments: { [reservationId]: tableId },
          successMessage: tableId ? "Le client a été placé." : "Le placement a été retiré.",
        });
        return;
      }
      if (message.type === "tok-table-v2:auto-place-request") autoPlace();
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [assignmentMutation, autoPlace]);

  const hasError = Boolean(
    branchesError || tablesError || layoutOverridesError || reservationsError || slotsError,
  );
  const loading = restaurantsLoading || branchesLoading || tablesLoading || reservationsLoading;

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
                Les placements sont partagés avec la V1 et enregistrés dans TOK.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {branches.length > 1 ? (
              <Select value={selectedBranchId || ""} onValueChange={setSelectedBranchId}>
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
            <Button type="button" variant="outline" size="sm" onClick={sendHydrate} disabled={!iframeReady}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openFullscreen}>
              <Expand className="mr-2 h-4 w-4" />
              Plein écran
            </Button>
          </div>
        </div>

        {hasError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Les données réelles n’ont pas pu être chargées. Réessayez dans un instant.
          </div>
        ) : null}

        {!selectedId && !restaurantsLoading ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Sélectionnez un restaurant pour charger ses clients et ses tables.
          </div>
        ) : null}

        {selectedId && !branchesLoading && branches.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Configurez d’abord une salle et ses tables dans la V1.
          </div>
        ) : null}

        {selectedId && selectedBranchId ? (
          <div
            ref={fullscreenRef}
            className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white shadow-sm [&:fullscreen>iframe]:h-screen [&:fullscreen>iframe]:min-h-0"
          >
            {loading ? (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Chargement des clients réels…
              </div>
            ) : null}
            <iframe
              ref={iframeRef}
              src={PROTOTYPE_URL}
              title="TOK TABLE 2 connecté"
              className="h-[calc(100vh-11rem)] min-h-[720px] w-full border-0"
              sandbox="allow-scripts allow-same-origin"
              allow="fullscreen"
              allowFullScreen
              onLoad={() => setIframeReady(true)}
            />
          </div>
        ) : null}
      </section>
    </DashboardLayout>
  );
}
