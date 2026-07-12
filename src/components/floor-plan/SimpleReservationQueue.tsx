import { useMemo, type DragEvent, type PointerEvent } from "react";
import { Clock3, GripVertical, Search, Sparkles, Users, X } from "lucide-react";

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
  getSafeTime,
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
  recommendedTablesByReservationId?: Map<string, ReservationTableRecommendation>;
  onReservationQueryChange: (value: string) => void;
  onReservationPress: (reservationId: string) => void;
  onReservationDragStart: (event: DragEvent<HTMLDivElement>, reservationId: string) => void;
  onReservationDragEnd: () => void;
  onReservationHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, reservationId: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  onAssignReservationToTable?: (reservationId: string, tableId: string) => void;
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
};

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
  getReservationDropState,
}: SimpleReservationQueueProps) {
  const reservations = useMemo(() => (
    [...unassignedReservations, ...assignedReservations].sort((left, right) => (
      Number(Boolean(draftAssignments[left.id])) - Number(Boolean(draftAssignments[right.id]))
      || getSafeTime(left.time).localeCompare(getSafeTime(right.time), "fr")
      || getReservationCustomerLabel(left).localeCompare(getReservationCustomerLabel(right), "fr")
    ))
  ), [assignedReservations, draftAssignments, unassignedReservations]);

  return (
    <Card className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Clients</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {unassignedReservations.length} à placer · {assignedReservations.length} placée(s)
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
            <Users className="h-4 w-4" />
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={reservationQuery}
            onChange={(event) => onReservationQueryChange(event.target.value)}
            placeholder="Rechercher un client"
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {reservationsLoading ? (
            <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>
          ) : reservations.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">Aucun client pour ce service</p>
            </div>
          ) : reservations.map((reservation) => {
            const tableId = draftAssignments[reservation.id]
              || (reservation as ServiceReservation & { table_id?: string | null }).table_id
              || null;
            const assignedTable = tableId ? tableMap.get(tableId) || null : null;
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
                draggable
                onClick={() => onReservationPress(reservation.id)}
                onDragStart={(event) => onReservationDragStart(event, reservation.id)}
                onDragEnd={onReservationDragEnd}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onReservationPress(reservation.id);
                  }
                }}
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                  isSelected
                    ? "border-orange-300 bg-orange-50 shadow-sm"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                  isDragging && "opacity-50",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-8 touch-none rounded-lg text-slate-400"
                  aria-label={`Déplacer ${getReservationCustomerLabel(reservation)}`}
                  onPointerDown={(event) => onReservationHandlePointerDown(event, reservation.id)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <GripVertical className="h-4 w-4" />
                </Button>

                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {getReservationCustomerLabel(reservation)}
                    </p>
                    {isZeroAttenteReservation(reservation) ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" title="Zéro Attente" />
                    ) : null}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock3 className="h-3 w-3" />
                    {getSafeTime(reservation.time)} · {reservation.party_size} pers.
                  </p>
                </div>

                <div className="flex min-w-[74px] justify-end">
                  {assignedTable ? (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800"
                      onClick={(event) => {
                        event.stopPropagation();
                        onReleaseReservation(reservation.id);
                      }}
                      title="Libérer la table"
                    >
                      {assignedTable.table_number}
                      <X className="h-3 w-3" />
                    </button>
                  ) : recommendation && onAssignReservationToTable ? (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-2.5 text-xs font-bold text-orange-800"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAssignReservationToTable(reservation.id, recommendation.table.id);
                      }}
                      title={`Placer à ${recommendation.table.table_number}`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {recommendation.table.table_number}
                    </button>
                  ) : selectedTable && canUseSelectedTable && onAssignReservationToTable ? (
                    <button
                      type="button"
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAssignReservationToTable(reservation.id, selectedTable.id);
                      }}
                    >
                      {selectedTable.table_number}
                    </button>
                  ) : (
                    <span className="inline-flex h-9 items-center rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800">
                      À placer
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
