import { useMemo, useState, type DragEvent, type PointerEvent } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  GripVertical,
  MessageSquare,
  Search,
  Sparkles,
  Table2,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  type ReservationDropState,
  type ReservationTableRecommendation,
  type ServiceDraftTable,
  type ServiceReservation,
  getReservationCustomerLabel,
  getReservationSpecialRequest,
  getReservationStatusLabel,
  getSafeTime,
  isReservationInService,
  isZeroAttenteReservation,
} from "./serviceShared";

type SimpleReservationQueueProps = {
  reservationQuery: string;
  reservationsLoading: boolean;
  selectedReservationId: string | null;
  selectedTable: ServiceDraftTable | null;
  draggedReservationId: string | null;
  unassignedReservations: ServiceReservation[];
  assignedReservations: ServiceReservation[];
  draftAssignments: Record<string, string | null>;
  tableMap: Map<string, ServiceDraftTable>;
  recommendedTablesByReservationId?: Map<
    string,
    ReservationTableRecommendation
  >;
  onReservationQueryChange: (value: string) => void;
  onReservationPress: (reservationId: string) => void;
  onReservationDragStart: (
    event: DragEvent<HTMLDivElement>,
    reservationId: string,
  ) => void;
  onReservationDragEnd: () => void;
  onReservationHandlePointerDown: (
    event: PointerEvent<HTMLButtonElement>,
    reservationId: string,
  ) => void;
  onReleaseReservation: (reservationId: string) => void;
  onAssignReservationToTable?: (reservationId: string, tableId: string) => void;
  onReservationStatusChange?: (reservationId: string, status: string) => void;
  reservationStatusPending?: boolean;
  onOpenReservationDetails?: (reservationId: string) => void;
  getReservationDropState: (
    reservationId: string,
    tableId: string,
  ) => ReservationDropState;
};

type QueueView = "upcoming" | "in-room" | "all";

function getAssignedTableId(
  reservation: ServiceReservation,
  assignments: Record<string, string | null>,
) {
  // A draft release must take precedence over the saved assignment.
  return Object.prototype.hasOwnProperty.call(assignments, reservation.id)
    ? assignments[reservation.id]
    : (reservation as ServiceReservation & { table_id?: string | null })
        .table_id || null;
}

export default function SimpleReservationQueue({
  reservationQuery,
  reservationsLoading,
  selectedReservationId,
  selectedTable,
  draggedReservationId,
  unassignedReservations,
  assignedReservations,
  draftAssignments,
  tableMap,
  recommendedTablesByReservationId = new Map(),
  onReservationQueryChange,
  onReservationPress,
  onReservationDragStart,
  onReservationDragEnd,
  onReservationHandlePointerDown,
  onReleaseReservation,
  onAssignReservationToTable,
  onReservationStatusChange,
  reservationStatusPending = false,
  onOpenReservationDetails,
  getReservationDropState,
}: SimpleReservationQueueProps) {
  const [queueView, setQueueView] = useState<QueueView>("upcoming");
  const reservations = useMemo(
    () =>
      [...unassignedReservations, ...assignedReservations].sort(
        (left, right) =>
          getSafeTime(left.time).localeCompare(getSafeTime(right.time), "fr") ||
          getReservationCustomerLabel(left).localeCompare(
            getReservationCustomerLabel(right),
            "fr",
          ),
      ),
    [assignedReservations, unassignedReservations],
  );
  const upcomingReservations = reservations.filter((reservation) =>
    ["pending", "confirmed"].includes(
      String(reservation.status || "pending").toLowerCase(),
    ),
  );
  const inRoomReservations = reservations.filter(isReservationInService);
  const visibleReservations =
    queueView === "upcoming"
      ? upcomingReservations
      : queueView === "in-room"
        ? inRoomReservations
        : reservations;
  const selectedReservation =
    reservations.find(
      (reservation) => reservation.id === selectedReservationId,
    ) || null;
  const selectedAssignedId = selectedReservation
    ? getAssignedTableId(selectedReservation, draftAssignments)
    : null;
  const selectedAssignedTable = selectedAssignedId
    ? tableMap.get(selectedAssignedId) || null
    : null;
  const selectedStatus = String(
    selectedReservation?.status || "pending",
  ).toLowerCase();
  const selectedNote = selectedReservation
    ? getReservationSpecialRequest(selectedReservation)
    : null;
  const queueViews: Array<{ value: QueueView; label: string; count: number }> =
    [
      {
        value: "upcoming",
        label: "À venir",
        count: upcomingReservations.length,
      },
      { value: "in-room", label: "En salle", count: inRoomReservations.length },
      { value: "all", label: "Toutes", count: reservations.length },
    ];

  return (
    <Card className="flex h-full min-h-[440px] flex-col overflow-hidden rounded-2xl border-stone-200/80 bg-white shadow-[0_3px_20px_-14px_rgba(64,42,22,0.2)] dark:border-border dark:bg-card">
      <div className="shrink-0 px-4 pt-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 dark:text-foreground">
            Réservations
          </h2>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium tabular-nums text-stone-600 dark:bg-muted dark:text-muted-foreground">
            {unassignedReservations.length} à placer
          </span>
        </div>
        <div
          className="mt-3 grid grid-cols-3 border-b border-stone-200 dark:border-border"
          role="group"
          aria-label="Vue des réservations"
        >
          {queueViews.map((view) => (
            <button
              key={view.value}
              type="button"
              aria-pressed={queueView === view.value}
              onClick={() => setQueueView(view.value)}
              className={cn(
                "relative min-h-11 px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm",
                queueView === view.value
                  ? "text-primary after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[3px] after:rounded-full after:bg-primary"
                  : "text-stone-500 hover:text-stone-900 dark:text-muted-foreground dark:hover:text-foreground",
              )}
            >
              {view.label}{" "}
              <span className="tabular-nums">{`· ${view.count}`}</span>
            </button>
          ))}
        </div>
        <div className="relative my-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500"
          />
          <Input
            value={reservationQuery}
            onChange={(event) => onReservationQueryChange(event.target.value)}
            placeholder="Nom ou réservation…"
            aria-label="Rechercher une réservation"
            className="h-11 rounded-lg border-stone-200 bg-transparent pl-9 pr-9 text-sm shadow-none dark:border-border"
          />
          {reservationQuery ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => onReservationQueryChange("")}
              className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center rounded-lg text-stone-500 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        aria-label="Liste des réservations"
      >
        <div
          className="space-y-2 px-4 pb-4 sm:px-5"
          aria-busy={reservationsLoading}
        >
          {reservationsLoading ? (
            <div className="space-y-2 py-2" role="status">
              <span className="sr-only">Chargement des réservations…</span>
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-[76px] animate-pulse rounded-xl bg-stone-100 motion-reduce:animate-none dark:bg-muted"
                />
              ))}
            </div>
          ) : visibleReservations.length === 0 ? (
            <div
              className="flex flex-col items-center px-3 py-10 text-center"
              role="status"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400 dark:bg-muted">
                <Users className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {reservationQuery
                  ? "Aucune réservation trouvée"
                  : queueView === "in-room"
                    ? "Aucun client en salle"
                    : queueView === "upcoming"
                      ? "Aucune arrivée attendue"
                      : "Aucune réservation pour ce service"}
              </p>
              <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                {reservationQuery
                  ? "Essayez un autre nom ou effacez votre recherche."
                  : "Les réservations de ce service apparaîtront ici."}
              </p>
              {queueView !== "all" && reservations.length > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 h-9 text-xs"
                  onClick={() => setQueueView("all")}
                >
                  Voir toutes les réservations
                </Button>
              ) : null}
            </div>
          ) : (
            visibleReservations.map((reservation) => {
              const tableId = getAssignedTableId(reservation, draftAssignments);
              const assignedTable = tableId
                ? tableMap.get(tableId) || null
                : null;
              const recommendation = !assignedTable
                ? recommendedTablesByReservationId.get(reservation.id) || null
                : null;
              const canUseSelectedTable = selectedTable
                ? getReservationDropState(reservation.id, selectedTable.id).ok
                : false;
              const isSelected = selectedReservationId === reservation.id;
              const isDragging = draggedReservationId === reservation.id;
              return (
                <div
                  key={reservation.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${getReservationCustomerLabel(reservation)}, ${getSafeTime(reservation.time)}, ${reservation.party_size} personnes, ${assignedTable ? assignedTable.table_number : "À placer"}`}
                  draggable
                  onClick={() => onReservationPress(reservation.id)}
                  onDragStart={(event) =>
                    onReservationDragStart(event, reservation.id)
                  }
                  onDragEnd={onReservationDragEnd}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onReservationPress(reservation.id);
                    }
                  }}
                  className={cn(
                    "group relative grid grid-cols-[42px_minmax(0,1fr)_24px] items-center gap-2 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    isSelected
                      ? "border-orange-200 border-l-[3px] border-l-primary bg-orange-50/70 dark:border-primary/40 dark:bg-primary/10"
                      : "border-stone-200/80 bg-white hover:border-orange-200 hover:bg-stone-50/70 dark:border-border dark:bg-card dark:hover:bg-muted",
                    isDragging && "opacity-50",
                  )}
                >
                  <span className="self-start pt-0.5 text-sm font-semibold tabular-nums text-stone-900 dark:text-foreground">
                    {getSafeTime(reservation.time)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-stone-900 dark:text-foreground">
                        {getReservationCustomerLabel(reservation)}
                      </p>
                      {isZeroAttenteReservation(reservation) ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
                          title="Zéro Attente"
                        />
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-muted-foreground">
                      {`${reservation.party_size} personnes · ${assignedTable ? assignedTable.table_number : "À placer"}`}
                    </p>
                    {queueView === "all" ||
                    isReservationInService(reservation) ? (
                      <p className="mt-1 text-[11px] font-medium text-stone-500 dark:text-muted-foreground">
                        {getReservationStatusLabel(reservation.status)}
                      </p>
                    ) : null}
                    {isSelected || !assignedTable ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {assignedTable ? (
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 text-xs font-medium text-stone-600 hover:border-stone-300 dark:border-border dark:bg-card dark:text-foreground"
                            aria-label={`Libérer ${assignedTable.table_number} pour ${getReservationCustomerLabel(reservation)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onReleaseReservation(reservation.id);
                            }}
                          >
                            <X className="h-3 w-3" /> Libérer la table
                          </button>
                        ) : recommendation && onAssignReservationToTable ? (
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2 text-xs font-medium text-orange-800 hover:bg-orange-100 dark:border-primary/25 dark:bg-primary/10 dark:text-orange-200"
                            aria-label={`Placer ${getReservationCustomerLabel(reservation)} à ${recommendation.table.table_number}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onAssignReservationToTable(
                                reservation.id,
                                recommendation.table.id,
                              );
                            }}
                          >
                            <Sparkles className="h-3 w-3" />
                            {recommendation.table.table_number} suggérée
                          </button>
                        ) : selectedTable &&
                          canUseSelectedTable &&
                          onAssignReservationToTable ? (
                          <button
                            type="button"
                            className="min-h-9 rounded-md border border-orange-200 bg-orange-50 px-2 text-xs font-medium text-orange-800 dark:border-primary/25 dark:bg-primary/10 dark:text-orange-200"
                            onClick={(event) => {
                              event.stopPropagation();
                              onAssignReservationToTable(
                                reservation.id,
                                selectedTable.id,
                              );
                            }}
                          >
                            {`Placer à ${selectedTable.table_number}`}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex h-full flex-col items-center justify-between">
                    <ChevronRight
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 text-stone-500"
                    />
                    <button
                      type="button"
                      className="-mb-2 flex h-9 w-9 touch-none items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-muted"
                      aria-label={`Déplacer ${getReservationCustomerLabel(reservation)}`}
                      onPointerDown={(event) =>
                        onReservationHandlePointerDown(event, reservation.id)
                      }
                      onClick={(event) => event.stopPropagation()}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {selectedReservation ? (
            <section
              className="!mt-5 rounded-xl border border-stone-200 border-l-[3px] border-l-primary bg-white p-4 dark:border-border dark:border-l-primary dark:bg-card"
              aria-label="Réservation sélectionnée"
            >
              <h3 className="font-serif text-xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-foreground">
                {getReservationCustomerLabel(selectedReservation)}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" />
                  {getSafeTime(selectedReservation.time)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {selectedReservation.party_size} personnes
                </span>
              </div>
              <div className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 text-sm dark:border-border">
                <span className="inline-flex items-center gap-2 font-medium">
                  <Table2 className="h-4 w-4 text-stone-500" />
                  {selectedAssignedTable?.table_number || "À placer"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {getReservationStatusLabel(selectedReservation.status)}
                </span>
              </div>
              {selectedNote ? (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-stone-700 dark:bg-amber-500/10 dark:text-amber-100">
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <p className="break-words">{selectedNote}</p>
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                {onReservationStatusChange &&
                ["pending", "confirmed", "arrived"].includes(selectedStatus) ? (
                  <Button
                    type="button"
                    className="h-11 w-full rounded-lg shadow-none"
                    disabled={reservationStatusPending}
                    onClick={() =>
                      onReservationStatusChange(
                        selectedReservation.id,
                        selectedStatus === "pending"
                          ? "confirmed"
                          : selectedStatus === "confirmed"
                            ? "arrived"
                            : "seated",
                      )
                    }
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {reservationStatusPending
                      ? "Mise à jour…"
                      : selectedStatus === "pending"
                        ? "Confirmer la réservation"
                        : selectedStatus === "confirmed"
                          ? "Marquer l’arrivée"
                          : "Installer les clients"}
                  </Button>
                ) : null}
                {onOpenReservationDetails ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full rounded-lg border-stone-200 shadow-none dark:border-border"
                    onClick={() =>
                      onOpenReservationDetails(selectedReservation.id)
                    }
                  >
                    Détails de la réservation
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-stone-100 px-4 py-3 dark:border-border sm:px-5">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-stone-500 dark:text-muted-foreground">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Sélectionnez un client, puis une table, ou glissez sa réservation sur
          le plan.
        </p>
      </div>
    </Card>
  );
}
