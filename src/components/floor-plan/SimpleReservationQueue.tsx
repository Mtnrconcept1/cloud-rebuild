import { useMemo, useState, type DragEvent, type PointerEvent } from "react";
import { Check, Clock3, GripVertical, History, MessageSquare, Search, Sparkles, Users, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { FLOOR_PLAN_TONE_CLASS } from "./floorPlanTones";
import ReservationServiceActions from "./ReservationServiceActions";
import {
  type ReservationDropState,
  type ReservationTableRecommendation,
  type ServiceDraftTable,
  type ServiceReservation,
  type ServiceReservationActionStatus,
  getReservationCustomerLabel,
  getReservationSpecialRequest,
  getReservationStatusTone,
  getSafeTime,
  getServiceReservationStatusLabel,
  isActiveServiceReservation,
  isZeroAttenteReservation,
} from "./serviceShared";

type QueueView = "unassigned" | "assigned" | "history";
type QueueSort = "time" | "party_size" | "status";

type SimpleReservationQueueProps = {
  reservationQuery: string;
  reservationsLoading: boolean;
  selectedReservationId: string | null;
  selectedTable: ServiceDraftTable | null;
  draggedReservationId: string | null;
  unassignedReservations: ServiceReservation[];
  assignedReservations: ServiceReservation[];
  historyReservations?: ServiceReservation[];
  draftAssignments: Record<string, string | null>;
  tableMap: Map<string, ServiceDraftTable>;
  recommendedTablesByReservationId?: Map<string, ReservationTableRecommendation>;
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  sortBy?: QueueSort;
  onSortByChange?: (value: QueueSort) => void;
  mutationsDisabled?: boolean;
  pendingReservationStatusId?: string | null;
  onReservationStatusChange?: (reservationId: string, status: ServiceReservationActionStatus) => void;
  onReservationQueryChange: (value: string) => void;
  onReservationPress: (reservationId: string) => void;
  onReservationDragStart: (event: DragEvent<HTMLDivElement>, reservationId: string) => void;
  onReservationDragEnd: () => void;
  onReservationHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, reservationId: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  onAssignReservationToTable?: (reservationId: string, tableId: string) => void;
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
};

const VIEW_LABELS: Record<QueueView, string> = {
  unassigned: "À placer",
  assigned: "Placés",
  history: "Historique",
};

export default function SimpleReservationQueue({
  reservationQuery,
  reservationsLoading,
  selectedReservationId,
  selectedTable,
  draggedReservationId,
  unassignedReservations,
  assignedReservations,
  historyReservations = [],
  draftAssignments,
  tableMap,
  recommendedTablesByReservationId = new Map(),
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  mutationsDisabled = false,
  pendingReservationStatusId = null,
  onReservationStatusChange,
  onReservationQueryChange,
  onReservationPress,
  onReservationDragStart,
  onReservationDragEnd,
  onReservationHandlePointerDown,
  onReleaseReservation,
  onAssignReservationToTable,
  getReservationDropState,
}: SimpleReservationQueueProps) {
  const [view, setView] = useState<QueueView>("unassigned");
  const [internalStatusFilter, setInternalStatusFilter] = useState("all");
  const [internalSortBy, setInternalSortBy] = useState<QueueSort>("time");
  const currentStatusFilter = statusFilter ?? internalStatusFilter;
  const currentSort = sortBy ?? internalSortBy;
  const writesDisabled = mutationsDisabled || pendingReservationStatusId !== null;
  const query = reservationQuery.trim().toLocaleLowerCase("fr");

  const changeStatusFilter = (value: string) => {
    setInternalStatusFilter(value);
    onStatusFilterChange?.(value);
  };
  const changeView = (value: QueueView) => {
    if (value === view) return;
    setView(value);
    changeStatusFilter("all");
  };
  const tableIdFor = (reservation: ServiceReservation) => Object.prototype.hasOwnProperty.call(draftAssignments, reservation.id)
    ? draftAssignments[reservation.id]
    : (reservation as ServiceReservation & { table_id?: string | null }).table_id || null;

  const reservations = useMemo(() => Array.from(new Map(
    [...unassignedReservations, ...assignedReservations, ...historyReservations].map((reservation) => [reservation.id, reservation]),
  ).values()), [unassignedReservations, assignedReservations, historyReservations]);

  const groups: Record<QueueView, ServiceReservation[]> = { unassigned: [], assigned: [], history: [] };
  reservations.forEach((reservation) => {
    const tableId = tableIdFor(reservation);
    const table = tableId ? tableMap.get(tableId) : null;
    const statusLabel = getServiceReservationStatusLabel(reservation.status);
    if (currentStatusFilter !== "all" && statusLabel !== getServiceReservationStatusLabel(currentStatusFilter)) return;
    if (query && ![
      getReservationCustomerLabel(reservation), reservation.customer?.phone, getSafeTime(reservation.time), table?.table_number,
    ].filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(query)) return;
    const group = !isActiveServiceReservation(reservation) ? "history" : tableId ? "assigned" : "unassigned";
    groups[group].push(reservation);
  });
  Object.values(groups).forEach((group) => group.sort((left, right) => (
    (currentSort === "party_size" ? Number(right.party_size || 0) - Number(left.party_size || 0) : 0)
    || (currentSort === "status" ? getServiceReservationStatusLabel(left.status).localeCompare(getServiceReservationStatusLabel(right.status), "fr") : 0)
    || getSafeTime(left.time).localeCompare(getSafeTime(right.time), "fr")
    || getReservationCustomerLabel(left).localeCompare(getReservationCustomerLabel(right), "fr")
    || left.id.localeCompare(right.id)
  )));
  const visibleReservations = groups[view];
  const otherMatchingView = (Object.keys(VIEW_LABELS) as QueueView[]).find((key) => key !== view && groups[key].length > 0);
  const hasFilters = !!query || currentStatusFilter !== "all";

  return (
    <Card className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Clients</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Placez les clients, puis suivez leur arrivée.
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Rechercher un client, une heure ou une table"
            value={reservationQuery}
            onChange={(event) => onReservationQueryChange(event.target.value)}
            placeholder="Client, heure ou table"
            className="h-10 rounded-xl border-border bg-muted pl-9 pr-10"
          />
          {reservationQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Effacer la recherche"
              className="absolute right-0 top-0 h-10 w-10 rounded-xl"
              onClick={() => onReservationQueryChange("")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Afficher les clients">
          {(Object.keys(VIEW_LABELS) as QueueView[]).map((key) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              aria-pressed={view === key}
              aria-label={`${VIEW_LABELS[key]} ${groups[key].length}`}
              className={cn("h-auto min-h-10 min-w-0 flex-wrap gap-x-1 rounded-lg px-1 py-2 text-xs", view === key && "bg-background text-foreground shadow-sm hover:bg-background")}
              onClick={() => changeView(key)}
            >
              {VIEW_LABELS[key]}
              <span className="tabular-nums text-muted-foreground">{groups[key].length}</span>
            </Button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            aria-label="Filtrer les clients par statut"
            value={currentStatusFilter}
            onChange={(event) => changeStatusFilter(event.target.value)}
            className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tous les statuts</option>
            {(view === "history" ? ["completed", "cancelled", "no_show", "archived"] : ["pending", "confirmed", "arrived", "seated"]).map((status) => (
              <option key={status} value={status}>{getServiceReservationStatusLabel(status)}</option>
            ))}
          </select>
          <select
            aria-label="Trier les clients"
            value={currentSort}
            onChange={(event) => {
              const value = event.target.value as QueueSort;
              setInternalSortBy(value);
              onSortByChange?.(value);
            }}
            className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="time">Par heure</option>
            <option value="party_size">Grands groupes d’abord</option>
            <option value="status">Par statut</option>
          </select>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3" aria-label={`Clients : ${VIEW_LABELS[view]}`} aria-busy={reservationsLoading}>
          {reservationsLoading ? (
            <p role="status" className="py-10 text-center text-sm text-muted-foreground">Chargement des clients…</p>
          ) : visibleReservations.length === 0 ? (
            <div className="px-2 py-10 text-center">
              {view === "unassigned" && groups.assigned.length > 0 && !hasFilters
                ? <Check className="mx-auto h-7 w-7 text-emerald-600" aria-hidden="true" />
                : <Users className="mx-auto h-7 w-7 text-muted-foreground/60" aria-hidden="true" />}
              <p className="mt-2 text-sm font-semibold text-foreground">
                {view === "unassigned" && groups.assigned.length > 0 && !hasFilters
                  ? "Tous les clients ont une table"
                  : hasFilters ? "Aucun résultat dans cette liste"
                    : view === "history" ? "Aucune réservation dans l’historique"
                      : view === "assigned" ? "Aucun client placé"
                        : "Aucun client à placer pour ce service"}
              </p>
              {otherMatchingView ? (
                <Button type="button" variant="outline" className="mt-3 min-h-10 rounded-xl" onClick={() => changeView(otherMatchingView)}>
                  {otherMatchingView === "assigned" ? "Voir les clients placés" : otherMatchingView === "history" ? "Voir l’historique" : "Voir les clients à placer"}
                </Button>
              ) : hasFilters ? (
                <Button type="button" variant="ghost" className="mt-3 min-h-10 rounded-xl" onClick={() => { onReservationQueryChange(""); changeStatusFilter("all"); }}>
                  Effacer les filtres
                </Button>
              ) : null}
            </div>
          ) : visibleReservations.map((reservation) => {
            const tableId = tableIdFor(reservation);
            const assignedTable = tableId ? tableMap.get(tableId) || null : null;
            const active = isActiveServiceReservation(reservation);
            const customerName = getReservationCustomerLabel(reservation);
            const canUseSelectedTable = active && selectedTable?.is_active && selectedTable.layout.kind === "table"
              && selectedTable.capacity > 0 && getReservationDropState(reservation.id, selectedTable.id).ok;
            const recommendation = active && !tableId ? recommendedTablesByReservationId.get(reservation.id) || null : null;
            const targetTable = !tableId && canUseSelectedTable ? selectedTable : recommendation?.table || null;
            const canPlace = !!targetTable && targetTable.is_active && targetTable.layout.kind === "table"
              && targetTable.capacity > 0 && getReservationDropState(reservation.id, targetTable.id).ok;
            const specialRequest = getReservationSpecialRequest(reservation);

            return (
              <div
                key={reservation.id}
                draggable={active && !writesDisabled}
                onDragStart={(event) => {
                  if (!active || writesDisabled) { event.preventDefault(); return; }
                  onReservationDragStart(event, reservation.id);
                }}
                onDragEnd={onReservationDragEnd}
                className={cn(
                  "rounded-2xl border border-border bg-card p-3 transition-colors",
                  selectedReservationId === reservation.id && "border-primary bg-primary/5 ring-1 ring-primary/30",
                  draggedReservationId === reservation.id && "opacity-50",
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Ouvrir la réservation de ${customerName}`}
                    onClick={() => onReservationPress(reservation.id)}
                  >
                    <span className="block break-words text-sm font-semibold text-foreground">{customerName}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{getSafeTime(reservation.time)}</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{reservation.party_size} pers.</span>
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <Badge className={cn("border text-[11px]", getReservationStatusTone(reservation.status))}>
                        {getServiceReservationStatusLabel(reservation.status)}
                      </Badge>
                      {isZeroAttenteReservation(reservation) ? <Badge className={cn("border text-[11px]", FLOOR_PLAN_TONE_CLASS.teal)}>Zéro Attente</Badge> : null}
                      {!active ? <History className="h-4 w-4 text-muted-foreground" aria-label="Historique" /> : null}
                    </span>
                    {specialRequest ? (
                      <span className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="line-clamp-2 break-words">{specialRequest}</span>
                      </span>
                    ) : null}
                  </button>
                  {active ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={writesDisabled}
                      aria-label={`Déplacer ${customerName}`}
                      className="h-10 w-10 shrink-0 touch-none rounded-xl text-muted-foreground"
                      onPointerDown={(event) => { if (!writesDisabled) onReservationHandlePointerDown(event, reservation.id); }}
                    >
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                {tableId ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-1.5">
                    <span className="min-w-0 truncate text-xs font-semibold text-foreground">{assignedTable?.table_number || "Table indisponible"}</span>
                    {active ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={writesDisabled}
                        className="h-9 w-9 shrink-0 rounded-lg"
                        aria-label={`Retirer ${customerName} de ${assignedTable?.table_number || "la table"}`}
                        title="Retirer l’affectation de table"
                        onClick={() => onReleaseReservation(reservation.id)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                ) : canPlace && targetTable && onAssignReservationToTable ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={writesDisabled}
                    className="mt-3 h-auto min-h-10 w-full justify-start gap-2 whitespace-normal rounded-xl border-primary/25 text-left text-xs"
                    aria-label={`Placer ${customerName} à ${targetTable.table_number}`}
                    onClick={() => onAssignReservationToTable(reservation.id, targetTable.id)}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>Placer à <strong>{targetTable.table_number}</strong>{canUseSelectedTable ? " · sélectionnée" : " · recommandée"}</span>
                  </Button>
                ) : active ? (
                  <p className="mt-3 text-xs text-muted-foreground">Sans table · ouvrez la réservation pour choisir une place.</p>
                ) : null}
                {active ? (
                  <ReservationServiceActions
                    key={reservation.id}
                    reservation={reservation}
                    onStatusChange={onReservationStatusChange}
                    pendingReservationStatusId={pendingReservationStatusId}
                    disabled={mutationsDisabled || (reservation.status === "arrived" && !tableId)}
                    compact
                    className="mt-3"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
