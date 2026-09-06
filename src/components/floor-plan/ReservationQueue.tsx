import { useMemo, type DragEvent, type PointerEvent } from "react";
import { Clock3, Grip, PanelRightClose, PanelRightOpen, Pin, PinOff, Search, Sparkles, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";

import { FLOOR_PLAN_TONE_CLASS } from "./floorPlanTones";
import {
  type ReservationDropState,
  type ReservationTableRecommendation,
  type ServiceDraftTable,
  type ServiceReservation,
  getReservationCustomerLabel,
  getReservationMiamzPriority,
  getReservationMiamzPriorityLabel,
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
  recommendedTablesByReservationId?: Map<string, ReservationTableRecommendation>;
  collapsed?: boolean;
  detached?: boolean;
  onToggleCollapsed?: () => void;
  onToggleDetached?: () => void;
  onReservationQueryChange: (value: string) => void;
  onReservationPress: (reservationId: string) => void;
  onReservationDragStart: (event: DragEvent<HTMLDivElement>, reservationId: string) => void;
  onReservationDragEnd: () => void;
  onReservationHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, reservationId: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  onAssignReservationToTable?: (reservationId: string, tableId: string) => void;
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
  recommendedTable,
  selectedTable,
  onPress,
  onDragStart,
  onDragEnd,
  onHandlePointerDown,
  onRelease,
  onAssignRecommendedTable,
  getReservationDropState,
}: {
  reservation: ServiceReservation;
  isSelected: boolean;
  isDragging: boolean;
  assignedTable: ServiceDraftTable | null;
  recommendedTable: ReservationTableRecommendation | null;
  selectedTable: ServiceDraftTable | null;
  onPress: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onRelease: () => void;
  onAssignRecommendedTable: (() => void) | null;
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
}) {
  const serviceLabel = getServicePeriodLabel(getServicePeriodFromMetadata(reservation.metadata, reservation.time));
  const note = getReservationSpecialRequest(reservation);
  const isZeroAttente = isZeroAttenteReservation(reservation);
  const miamzPriority = getReservationMiamzPriority(reservation);
  const miamzPriorityLabel = getReservationMiamzPriorityLabel(reservation);
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
        "touch-pan-y w-full cursor-pointer rounded-2xl border px-3 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/20",
        isSelected
          ? "border-primary bg-primary text-primary-foreground shadow-[0_18px_45px_-28px_hsl(var(--primary)/0.8)]"
          : "border-border bg-card hover:border-border hover:bg-muted",
        isDragging && "scale-[0.99] opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("truncate text-base font-semibold", isSelected ? "text-primary-foreground" : "text-foreground")}>
              {getReservationCustomerLabel(reservation)}
            </span>
            {isZeroAttente ? (
              <Badge className={cn("border", isSelected ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground" : FLOOR_PLAN_TONE_CLASS.teal)}>
                Zéro Attente
              </Badge>
            ) : null}
            {miamzPriority > 0 ? (
              <Badge className={cn("border", isSelected ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground" : "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-200")}>
                {miamzPriorityLabel || "Priorite Miamz"}
              </Badge>
            ) : null}
            <Badge className={cn("border", isSelected ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground" : getReservationStatusTone(reservation.status))}>
              {reservation.status || "pending"}
            </Badge>
          </div>

          <div className={cn("flex flex-wrap items-center gap-2 text-sm", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
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
              <Badge variant="outline" className={cn(isSelected ? "border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground" : FLOOR_PLAN_TONE_CLASS.neutral)}>
                {assignedTable.table_number}
              </Badge>
            ) : (
              <Badge variant="outline" className={cn(isSelected ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground" : FLOOR_PLAN_TONE_CLASS.amber)}>
                Sans table
              </Badge>
            )}

            {selectedTable ? (
              <Badge
                variant="outline"
                className={cn(
                  dropState?.ok
                    ? isSelected
                      ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground"
                      : FLOOR_PLAN_TONE_CLASS.emerald
                    : isSelected
                      ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground"
                      : FLOOR_PLAN_TONE_CLASS.rose,
                )}
              >
                {dropState?.ok ? `Compatible ${selectedTable.table_number}` : "Incompatible"}
              </Badge>
            ) : null}

            {note ? (
              <Badge variant="outline" className={cn(isSelected ? "border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground/90" : FLOOR_PLAN_TONE_CLASS.neutral)}>
                Note client
              </Badge>
            ) : null}
          </div>

          {!assignedTable && recommendedTable && onAssignRecommendedTable ? (
            <div className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2",
              isSelected ? "border-primary-foreground/20 bg-primary-foreground/10" : FLOOR_PLAN_TONE_CLASS.emerald,
            )}>
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs font-semibold", isSelected ? "text-primary-foreground" : "text-emerald-900 dark:text-emerald-100")}>
                  Table recommandee
                </p>
                <p className={cn("mt-0.5 text-sm font-bold", isSelected ? "text-primary-foreground" : "text-foreground")}>
                  {recommendedTable.table.table_number}
                  <span className={cn("ml-2 text-xs font-semibold", isSelected ? "text-primary-foreground" : "text-emerald-700 dark:text-emerald-300")}>
                    Score {recommendedTable.score}
                  </span>
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isSelected ? "secondary" : "outline"}
                className={cn("rounded-xl", isSelected && "bg-primary-foreground text-primary hover:bg-primary-foreground/90")}
                aria-label={`Affecter ${getReservationCustomerLabel(reservation)} a ${recommendedTable.table.table_number}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAssignRecommendedTable();
                }}
              >
                Affecter
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button
            type="button"
            size="sm"
            variant={isSelected ? "secondary" : "outline"}
            className={cn("touch-none rounded-xl px-3", isSelected && "bg-primary-foreground text-primary hover:bg-primary-foreground/90")}
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
              className={cn("rounded-xl", isSelected && "bg-primary-foreground text-primary hover:bg-primary-foreground/90")}
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
  recommendedTablesByReservationId = new Map(),
  collapsed = false,
  detached = false,
  onToggleCollapsed,
  onToggleDetached,
  onReservationQueryChange,
  onReservationPress,
  onReservationDragStart,
  onReservationDragEnd,
  onReservationHandlePointerDown,
  onReleaseReservation,
  onAssignReservationToTable,
  getReservationDropState,
}: ReservationQueueProps) {
  const totalReservations = unassignedReservations.length + assignedReservations.length;
  const serviceTimeline = useMemo(() => {
    return [...unassignedReservations, ...assignedReservations]
      .map((reservation) => {
        const assignedTableId = draftAssignments[reservation.id]
          || (reservation as ServiceReservation & { table_id?: string | null }).table_id;
        const assignedTable = assignedTableId ? tableMap.get(assignedTableId) || null : null;

        return {
          reservation,
          assignedTable,
          sortKey: getServiceTimelineSortKey(reservation),
          miamzPriority: getReservationMiamzPriority(reservation),
        };
      })
      .sort((left, right) => (
        right.miamzPriority - left.miamzPriority
        || left.sortKey.localeCompare(right.sortKey)
      ))
      .slice(0, 8);
  }, [assignedReservations, draftAssignments, tableMap, unassignedReservations]);

  if (collapsed) {
    return (
      <Card className="flex h-full min-h-[180px] flex-col items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" data-panel-drag-handle title="Déplacer la file de service">
          <Grip className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onToggleCollapsed} title="Déplier la file de service">
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onToggleDetached} title={detached ? "Rattacher la file" : "Détacher la file"}>
          {detached ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
        </Button>
        <Badge variant="outline" className="rounded-full border-border bg-card text-muted-foreground">
          {totalReservations}
        </Badge>
      </Card>
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <CardHeader className="space-y-3 border-b border-border/70 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-foreground">File de service</CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">Glissez ou touchez une réservation.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" className="rounded-full border-border bg-card text-muted-foreground">
              {totalReservations}
            </Badge>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" data-panel-drag-handle title="Déplacer la file de service">
              <Grip className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onToggleDetached} title={detached ? "Rattacher" : "Détacher"}>
              {detached ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onToggleCollapsed} title="Replier la file de service">
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={reservationQuery}
              onChange={(event) => onReservationQueryChange(event.target.value)}
              placeholder="Nom, heure, taille, statut..."
              className="h-10 rounded-xl border-border bg-card pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className={cn("rounded-xl border px-3 py-2 text-center", FLOOR_PLAN_TONE_CLASS.amber)}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Sans table</p>
              <p className="mt-1 text-xl font-bold text-amber-900 dark:text-amber-100">{unassignedReservations.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-3 py-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Placées</p>
              <p className="mt-1 text-xl font-bold text-foreground">{assignedReservations.length}</p>
            </div>
          </div>
        </div>

        {selectedTable ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
              <Table2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Table sélectionnée: {selectedTable.table_number}</p>
              <p className="text-xs text-muted-foreground">Compatibilité calculée pour {selectedTable.capacity} couverts.</p>
            </div>
          </div>
        ) : null}

        {serviceTimeline.length > 0 ? (
          <div
            data-testid="reservation-service-timeline"
            className="rounded-xl border border-border bg-card px-3 py-2 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Timeline</p>
                  <p className="truncate text-xs text-muted-foreground">Prochaines arrivées</p>
                </div>
              </div>
              <Badge variant="outline" className="rounded-full border-border bg-muted text-muted-foreground">
                {serviceTimeline.length}
              </Badge>
            </div>

            <div className="mt-3 grid gap-2">
              {serviceTimeline.map(({ reservation, assignedTable }) => {
                const isTimelineSelected = reservation.id === selectedReservationId;
                const miamzPriority = getReservationMiamzPriority(reservation);

                return (
                  <button
                    key={`timeline-${reservation.id}`}
                    type="button"
                    className={cn(
                      "grid min-h-10 grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors sm:grid-cols-[52px_minmax(0,1fr)_auto_auto_auto]",
                      isTimelineSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/50 hover:bg-muted",
                    )}
                    onClick={() => onReservationPress(reservation.id)}
                  >
                    <span className={cn("text-sm font-bold", isTimelineSelected ? "text-primary-foreground" : "text-foreground")}>
                      {getSafeTime(reservation.time)}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-semibold", isTimelineSelected ? "text-primary-foreground" : "text-foreground")}>
                        {getReservationCustomerLabel(reservation)}
                      </span>
                      <span className={cn("block truncate text-xs", isTimelineSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {reservation.party_size} pers. - {getShortDateLabel(reservation.date)}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "justify-self-end rounded-full",
                        assignedTable
                          ? isTimelineSelected
                            ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground"
                            : "border-border bg-card text-foreground"
                          : isTimelineSelected
                            ? "border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground"
                            : FLOOR_PLAN_TONE_CLASS.amber,
                      )}
                    >
                      {assignedTable?.table_number || "Sans table"}
                    </Badge>
                    <Badge className={cn("hidden border sm:inline-flex", isTimelineSelected ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground" : getReservationStatusTone(reservation.status))}>
                      {reservation.status || "pending"}
                    </Badge>
                    {miamzPriority > 0 ? (
                      <Badge className={cn("hidden border sm:inline-flex", isTimelineSelected ? "border-pink-200/30 bg-pink-400/15 text-pink-50" : "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-200")}>
                        Priorite Miamz
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-3">
            {reservationsLoading ? (
              <p className="text-sm text-muted-foreground">Chargement des réservations...</p>
            ) : null}

            {!reservationsLoading && totalReservations === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-8 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">Aucune réservation visible</p>
                <p className="mt-1 text-sm text-muted-foreground">Ajustez la date, le service ou la recherche pour afficher la file utile.</p>
              </div>
            ) : null}

            {unassignedReservations.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">À placer en priorité</p>
                    <p className="text-sm text-muted-foreground">Les réservations sans table restent en tête.</p>
                  </div>
                  <Badge className={cn("border", FLOOR_PLAN_TONE_CLASS.amber)}>
                    {unassignedReservations.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {unassignedReservations.map((reservation) => (
                    <ReservationQueueItem
                      key={reservation.id}
                      reservation={reservation}
                      isSelected={reservation.id === selectedReservationId}
                      isDragging={draggedReservationId === reservation.id}
                      assignedTable={null}
                      recommendedTable={recommendedTablesByReservationId.get(reservation.id) || null}
                      selectedTable={selectedTable}
                      onPress={() => onReservationPress(reservation.id)}
                      onDragStart={(event) => onReservationDragStart(event, reservation.id)}
                      onDragEnd={onReservationDragEnd}
                      onHandlePointerDown={(event) => onReservationHandlePointerDown(event, reservation.id)}
                      onRelease={() => onReleaseReservation(reservation.id)}
                      onAssignRecommendedTable={recommendedTablesByReservationId.has(reservation.id) && onAssignReservationToTable
                        ? () => onAssignReservationToTable(reservation.id, recommendedTablesByReservationId.get(reservation.id)!.table.id)
                        : null}
                      getReservationDropState={getReservationDropState}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {assignedReservations.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Déjà affectées</p>
                    <p className="text-sm text-muted-foreground">Touchez pour déplacer rapidement vers une autre table.</p>
                  </div>
                  <Badge variant="outline" className="rounded-full border-border bg-card text-muted-foreground">
                    {assignedReservations.length}
                  </Badge>
                </div>

                <div className="space-y-2">
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
                        recommendedTable={null}
                        selectedTable={selectedTable}
                        onPress={() => onReservationPress(reservation.id)}
                        onDragStart={(event) => onReservationDragStart(event, reservation.id)}
                        onDragEnd={onReservationDragEnd}
                        onHandlePointerDown={(event) => onReservationHandlePointerDown(event, reservation.id)}
                        onRelease={() => onReleaseReservation(reservation.id)}
                        onAssignRecommendedTable={null}
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
