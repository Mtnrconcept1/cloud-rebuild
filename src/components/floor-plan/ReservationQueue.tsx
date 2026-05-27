import { useMemo, type DragEvent, type PointerEvent } from "react";
import { Clock3, Grip, Search, Sparkles, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";

import {
  type ReservationDropState,
  type ServiceDraftTable,
  type ServiceReservation,
  getReservationCustomerLabel,
  getReservationSpecialRequest,
  getReservationStatusTone,
  getSafeTime,
  getShortDateLabel,
  isZeroAttenteReservation,
} from "./serviceShared";

type ReservationQueueProps = {
  reservationQuery: string;
  reservationsLoading: boolean;
  selectedReservationId: string | null;
  selectedTable: ServiceDraftTable | null;
  draggedReservationId: string | null;
  unassignedReservations: ServiceReservation[];
  assignedReservations: ServiceReservation[];
  draftAssignments: Record<string, string | null>;
  tableMap: Map<string, ServiceDraftTable>;
  onReservationQueryChange: (value: string) => void;
  onReservationPress: (reservationId: string) => void;
  onReservationDragStart: (event: DragEvent<HTMLDivElement>, reservationId: string) => void;
  onReservationDragEnd: () => void;
  onReservationHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, reservationId: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
};

function getServiceTimelineSortKey(reservation: ServiceReservation) {
  return `${reservation.date || "9999-12-31"}T${getSafeTime(reservation.time)}`;
}

function ReservationQueueItem({
  reservation,
  isSelected,
  isDragging,
  assignedTable,
  selectedTable,
  onPress,
  onDragStart,
  onDragEnd,
  onHandlePointerDown,
  onRelease,
  getReservationDropState,
}: {
  reservation: ServiceReservation;
  isSelected: boolean;
  isDragging: boolean;
  assignedTable: ServiceDraftTable | null;
  selectedTable: ServiceDraftTable | null;
  onPress: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onRelease: () => void;
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
}) {
  const serviceLabel = getServicePeriodLabel(getServicePeriodFromMetadata(reservation.metadata, reservation.time));
  const note = getReservationSpecialRequest(reservation);
  const isZeroAttente = isZeroAttenteReservation(reservation);
  const dropState = selectedTable ? getReservationDropState(reservation.id, selectedTable.id) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={onPress}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPress();
        }
      }}
      className={cn(
        "touch-pan-y w-full cursor-pointer rounded-[24px] border px-4 py-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/20",
        isSelected ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.8)]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
        isDragging && "scale-[0.99] opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("truncate text-base font-semibold", isSelected ? "text-white" : "text-slate-950")}>
              {getReservationCustomerLabel(reservation)}
            </span>
            {isZeroAttente ? (
              <Badge className={cn("border", isSelected ? "border-teal-300 bg-teal-400/20 text-teal-50" : "border-teal-200 bg-teal-50 text-teal-800")}>
                Zero Attente
              </Badge>
            ) : null}
            <Badge className={cn("border", isSelected ? "border-white/15 bg-white/10 text-white" : getReservationStatusTone(reservation.status))}>
              {reservation.status || "pending"}
            </Badge>
          </div>

          <div className={cn("flex flex-wrap items-center gap-2 text-sm", isSelected ? "text-slate-200" : "text-slate-500")}>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {getSafeTime(reservation.time)}
            </span>
            <span>{getShortDateLabel(reservation.date)}</span>
            <span>{reservation.party_size} pers.</span>
            <span>{serviceLabel || "Service"}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {assignedTable ? (
              <Badge variant="outline" className={cn(isSelected ? "border-white/15 bg-white/5 text-white" : "border-slate-200 bg-slate-50 text-slate-700")}>
                {assignedTable.table_number}
              </Badge>
            ) : (
              <Badge variant="outline" className={cn(isSelected ? "border-amber-200/30 bg-amber-400/15 text-amber-50" : "border-amber-200 bg-amber-50 text-amber-700")}>
                Sans table
              </Badge>
            )}

            {selectedTable ? (
              <Badge
                variant="outline"
                className={cn(
                  dropState?.ok
                    ? isSelected
                      ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-50"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : isSelected
                      ? "border-rose-300/30 bg-rose-400/15 text-rose-50"
                      : "border-rose-200 bg-rose-50 text-rose-700",
                )}
              >
                {dropState?.ok ? `Compatible ${selectedTable.table_number}` : "Incompatible"}
              </Badge>
            ) : null}

            {note ? (
              <Badge variant="outline" className={cn(isSelected ? "border-white/15 bg-white/5 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-600")}>
                Note client
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button
            type="button"
            size="sm"
            variant={isSelected ? "secondary" : "outline"}
            className={cn("touch-none rounded-2xl px-3", isSelected && "bg-white text-slate-900 hover:bg-white/90")}
            onPointerDown={onHandlePointerDown}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Grip className="h-3.5 w-3.5" />
            Glisser
          </Button>

          {assignedTable ? (
            <Button
              type="button"
              size="sm"
              variant={isSelected ? "secondary" : "outline"}
              className={cn("rounded-2xl", isSelected && "bg-white text-slate-900 hover:bg-white/90")}
              onClick={(event) => {
                event.stopPropagation();
                onRelease();
              }}
            >
              Libérer
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ReservationQueue({
  reservationQuery,
  reservationsLoading,
  selectedReservationId,
  selectedTable,
  draggedReservationId,
  unassignedReservations,
  assignedReservations,
  draftAssignments,
  tableMap,
  onReservationQueryChange,
  onReservationPress,
  onReservationDragStart,
  onReservationDragEnd,
  onReservationHandlePointerDown,
  onReleaseReservation,
  getReservationDropState,
}: ReservationQueueProps) {
  const totalReservations = unassignedReservations.length + assignedReservations.length;
  const serviceTimeline = useMemo(() => {
    return [...unassignedReservations, ...assignedReservations]
      .map((reservation) => {
        const assignedTableId = draftAssignments[reservation.id] || reservation.table_id;
        const assignedTable = assignedTableId ? tableMap.get(assignedTableId) || null : null;

        return {
          reservation,
          assignedTable,
          sortKey: getServiceTimelineSortKey(reservation),
        };
      })
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .slice(0, 8);
  }, [assignedReservations, draftAssignments, tableMap, unassignedReservations]);

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.96))] shadow-[0_32px_100px_-52px_rgba(15,23,42,0.42)]">
      <CardHeader className="space-y-4 border-b border-slate-200/80 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl text-slate-950">File de service</CardTitle>
            <CardDescription className="mt-1 text-slate-500">
              Glissez à la souris. Sur tablette, touchez Glisser puis déposez la réservation sur une table compatible.
            </CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
            {totalReservations}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={reservationQuery}
              onChange={(event) => onReservationQueryChange(event.target.value)}
              placeholder="Nom, heure, taille, statut..."
              className="h-12 rounded-2xl border-slate-200 bg-white pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Sans table</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{unassignedReservations.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Placées</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{assignedReservations.length}</p>
            </div>
          </div>
        </div>

        {selectedTable ? (
          <div className="flex items-center gap-2 rounded-[24px] border border-slate-200 bg-white px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Table2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Table sélectionnée: {selectedTable.table_number}</p>
              <p className="text-sm text-slate-500">
                La file met en avant les réservations compatibles pour {selectedTable.capacity} couverts.
              </p>
            </div>
          </div>
        ) : null}

        {serviceTimeline.length > 0 ? (
          <div
            data-testid="reservation-service-timeline"
            className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">Timeline service</p>
                  <p className="truncate text-xs text-slate-500">Prochaines arrivees et rotations visibles</p>
                </div>
              </div>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                {serviceTimeline.length}
              </Badge>
            </div>

            <div className="mt-3 grid gap-2">
              {serviceTimeline.map(({ reservation, assignedTable }) => {
                const isTimelineSelected = reservation.id === selectedReservationId;

                return (
                  <button
                    key={`timeline-${reservation.id}`}
                    type="button"
                    className={cn(
                      "grid min-h-11 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors sm:grid-cols-[52px_minmax(0,1fr)_auto_auto]",
                      isTimelineSelected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                    )}
                    onClick={() => onReservationPress(reservation.id)}
                  >
                    <span className={cn("text-sm font-bold", isTimelineSelected ? "text-white" : "text-slate-950")}>
                      {getSafeTime(reservation.time)}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-semibold", isTimelineSelected ? "text-white" : "text-slate-900")}>
                        {getReservationCustomerLabel(reservation)}
                      </span>
                      <span className={cn("block truncate text-xs", isTimelineSelected ? "text-slate-200" : "text-slate-500")}>
                        {reservation.party_size} pers. - {getShortDateLabel(reservation.date)}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "justify-self-end rounded-full",
                        assignedTable
                          ? isTimelineSelected
                            ? "border-white/15 bg-white/10 text-white"
                            : "border-slate-200 bg-white text-slate-700"
                          : isTimelineSelected
                            ? "border-amber-200/30 bg-amber-400/15 text-amber-50"
                            : "border-amber-200 bg-amber-50 text-amber-700",
                      )}
                    >
                      {assignedTable?.table_number || "Sans table"}
                    </Badge>
                    <Badge className={cn("hidden border sm:inline-flex", isTimelineSelected ? "border-white/15 bg-white/10 text-white" : getReservationStatusTone(reservation.status))}>
                      {reservation.status || "pending"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-6 p-4">
            {reservationsLoading ? (
              <p className="text-sm text-slate-500">Chargement des réservations...</p>
            ) : null}

            {!reservationsLoading && totalReservations === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-700">Aucune réservation visible</p>
                <p className="mt-1 text-sm text-slate-500">Ajustez la date, le service ou la recherche pour afficher la file utile.</p>
              </div>
            ) : null}

            {unassignedReservations.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">À placer en priorité</p>
                    <p className="text-sm text-slate-500">Les réservations sans table restent en tête.</p>
                  </div>
                  <Badge className="border border-amber-200 bg-amber-50 text-amber-800">
                    {unassignedReservations.length}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {unassignedReservations.map((reservation) => (
                    <ReservationQueueItem
                      key={reservation.id}
                      reservation={reservation}
                      isSelected={reservation.id === selectedReservationId}
                      isDragging={draggedReservationId === reservation.id}
                      assignedTable={null}
                      selectedTable={selectedTable}
                      onPress={() => onReservationPress(reservation.id)}
                      onDragStart={(event) => onReservationDragStart(event, reservation.id)}
                      onDragEnd={onReservationDragEnd}
                      onHandlePointerDown={(event) => onReservationHandlePointerDown(event, reservation.id)}
                      onRelease={() => onReleaseReservation(reservation.id)}
                      getReservationDropState={getReservationDropState}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {assignedReservations.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Déjà affectées</p>
                    <p className="text-sm text-slate-500">Touchez pour déplacer rapidement vers une autre table.</p>
                  </div>
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                    {assignedReservations.length}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {assignedReservations.map((reservation) => {
                    const assignedTableId = draftAssignments[reservation.id];
                    const assignedTable = assignedTableId ? tableMap.get(assignedTableId) || null : null;

                    return (
                      <ReservationQueueItem
                        key={reservation.id}
                        reservation={reservation}
                        isSelected={reservation.id === selectedReservationId}
                        isDragging={draggedReservationId === reservation.id}
                        assignedTable={assignedTable}
                        selectedTable={selectedTable}
                        onPress={() => onReservationPress(reservation.id)}
                        onDragStart={(event) => onReservationDragStart(event, reservation.id)}
                        onDragEnd={onReservationDragEnd}
                        onHandlePointerDown={(event) => onReservationHandlePointerDown(event, reservation.id)}
                        onRelease={() => onReleaseReservation(reservation.id)}
                        getReservationDropState={getReservationDropState}
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
