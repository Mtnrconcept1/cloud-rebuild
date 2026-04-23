import { CalendarClock, CreditCard, Receipt, Table2, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  type ReservationDropState,
  type ServiceDraftTable,
  type ServiceReservation,
  getReservationCustomerLabel,
  getReservationStatusTone,
  getSafeTime,
  getShortDateLabel,
  isZeroAttenteReservation,
} from "./serviceShared";

type ReservationPaymentDetails = {
  isPaid: boolean;
  totalAmount: number;
  paymentMethod: string | null;
  cardLabel: string | null;
  orderReference: string | null;
  checkoutSessionId: string | null;
} | null;

type ReservationPreorderItem = {
  menuItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  source: string | null;
  metadata: Record<string, unknown>;
};

type TableContextDrawerProps = {
  open: boolean;
  selectedReservation: ServiceReservation | null;
  selectedTable: ServiceDraftTable | null;
  selectedTableIsReservable: boolean;
  selectedReservationAssignedTable: ServiceDraftTable | null;
  selectedReservationAssignedTableId: string | null;
  selectedTableAssignments: ServiceReservation[];
  selectedReservationPaymentDetails: ReservationPaymentDetails;
  selectedReservationPreorderItems: ReservationPreorderItem[];
  selectedReservationSpecialRequest: string | null;
  selectedPairDropState: ReservationDropState | null;
  compatibleTables: ServiceDraftTable[];
  compatibleReservations: ServiceReservation[];
  onOpenChange: (open: boolean) => void;
  onClearSelection: () => void;
  onAssignReservationToTable: (reservationId: string, tableId: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  onSelectReservation: (reservationId: string) => void;
  onSelectTable: (tableId: string) => void;
};

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function TableContextDrawer({
  open,
  selectedReservation,
  selectedTable,
  selectedTableIsReservable,
  selectedReservationAssignedTable,
  selectedReservationAssignedTableId,
  selectedTableAssignments,
  selectedReservationPaymentDetails,
  selectedReservationPreorderItems,
  selectedReservationSpecialRequest,
  selectedPairDropState,
  compatibleTables,
  compatibleReservations,
  onOpenChange,
  onClearSelection,
  onAssignReservationToTable,
  onReleaseReservation,
  onSelectReservation,
  onSelectTable,
}: TableContextDrawerProps) {
  const title = selectedReservation && selectedTable
    ? `${selectedTable.table_number} · ${getReservationCustomerLabel(selectedReservation)}`
    : selectedTable
      ? `Table ${selectedTable.table_number}`
      : selectedReservation
        ? getReservationCustomerLabel(selectedReservation)
        : "Contexte service";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto max-h-[88vh] w-full max-w-[960px] rounded-t-[32px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(245,247,251,0.98))]">
        <DrawerHeader className="px-5 pb-2 pt-5 sm:px-6">
          <DrawerTitle className="text-xl text-slate-950">{title}</DrawerTitle>
          <DrawerDescription className="text-slate-500">
            Actions rapides pour le service. La sélection active reste au premier plan sans inspecteur permanent.
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="max-h-[calc(88vh-8.5rem)] px-5 pb-2 sm:px-6">
          <div className="space-y-5 pb-4">
            {(selectedReservation || selectedTable) ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {selectedReservation ? (
                  <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-lg font-semibold text-slate-950">
                            {getReservationCustomerLabel(selectedReservation)}
                          </p>
                          {isZeroAttenteReservation(selectedReservation) ? (
                            <Badge className="border border-teal-200 bg-teal-50 text-teal-800">Zero Attente</Badge>
                          ) : null}
                          <Badge className={cn("border", getReservationStatusTone(selectedReservation.status))}>
                            {selectedReservation.status || "pending"}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                          <span>{getShortDateLabel(selectedReservation.date)}</span>
                          <span>{getSafeTime(selectedReservation.time)}</span>
                          <span>{selectedReservation.party_size} pers.</span>
                          {selectedReservationAssignedTable ? (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              {selectedReservationAssignedTable.table_number}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              Sans table
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedReservationSpecialRequest ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                        {selectedReservationSpecialRequest}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedReservation && selectedTable && selectedTableIsReservable ? (
                        <Button
                          type="button"
                          className="rounded-2xl"
                          onClick={() => onAssignReservationToTable(selectedReservation.id, selectedTable.id)}
                          disabled={!selectedPairDropState?.ok}
                        >
                          {selectedPairDropState?.ok
                            ? `Affecter à ${selectedTable.table_number}`
                            : selectedPairDropState?.reason || "Affectation impossible"}
                        </Button>
                      ) : null}

                      {selectedReservationAssignedTableId ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => onReleaseReservation(selectedReservation.id)}
                        >
                          Retirer de la table
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {selectedTable ? (
                  <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <Table2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-lg font-semibold text-slate-950">{selectedTable.table_number}</p>
                          {selectedTableIsReservable ? (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              {selectedTable.capacity} couverts
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              Mobilier
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {selectedTableAssignments.length > 0
                            ? `${selectedTableAssignments.length} réservation(s) visibles sur cette table.`
                            : "Aucune réservation visible sur cette table."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedReservation && compatibleTables.length > 0 ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Tables compatibles</p>
                    <p className="mt-1 text-sm text-slate-500">Suggestions immédiates pour placer cette réservation.</p>
                  </div>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {compatibleTables.length}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {compatibleTables.map((table) => (
                    <Button
                      key={table.id}
                      type="button"
                      variant="outline"
                      className="h-auto justify-between rounded-2xl border-slate-200 px-4 py-3 text-left"
                      onClick={() => onAssignReservationToTable(selectedReservation.id, table.id)}
                    >
                      <span className="font-semibold">{table.table_number}</span>
                      <span className="text-xs text-slate-500">{table.capacity} couv.</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedTable && selectedTableIsReservable && compatibleReservations.length > 0 ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Réservations compatibles</p>
                    <p className="mt-1 text-sm text-slate-500">Touchez une réservation pour l'affecter directement à cette table.</p>
                  </div>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {compatibleReservations.length}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-2">
                  {compatibleReservations.map((reservation) => (
                    <Button
                      key={reservation.id}
                      type="button"
                      variant="outline"
                      className="h-auto justify-between rounded-2xl border-slate-200 px-4 py-3 text-left"
                      onClick={() => onAssignReservationToTable(reservation.id, selectedTable.id)}
                    >
                      <span className="font-semibold">{getReservationCustomerLabel(reservation)}</span>
                      <span className="text-xs text-slate-500">
                        {getSafeTime(reservation.time)} · {reservation.party_size} pers.
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedTable && selectedTableAssignments.length > 0 ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Planning visible sur cette table</p>
                    <p className="mt-1 text-sm text-slate-500">Raccourcis vers les réservations déjà liées à la table.</p>
                  </div>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {selectedTableAssignments.length}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-2">
                  {selectedTableAssignments.map((reservation) => (
                    <button
                      key={reservation.id}
                      type="button"
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                      onClick={() => onSelectReservation(reservation.id)}
                    >
                      <span className="font-medium text-slate-900">{getReservationCustomerLabel(reservation)}</span>
                      <span className="text-sm text-slate-500">{getSafeTime(reservation.time)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedReservation && (selectedReservationPaymentDetails || selectedReservationPreorderItems.length > 0) ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {selectedReservationPaymentDetails ? (
                  <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Paiement</p>
                        <p className="text-sm text-slate-500">Contexte rapide pour le service.</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge className={cn(
                        "border",
                        selectedReservationPaymentDetails.isPaid
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700",
                      )}>
                        {selectedReservationPaymentDetails.isPaid ? "Payé" : "À régler"}
                      </Badge>
                      {selectedReservationPaymentDetails.paymentMethod ? (
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                          {selectedReservationPaymentDetails.paymentMethod}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <span>Montant</span>
                        <span className="font-semibold text-slate-950">
                          {formatCurrency(selectedReservationPaymentDetails.totalAmount) || "Non renseigné"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Instrument</span>
                        <span className="text-right font-medium text-slate-900">
                          {selectedReservationPaymentDetails.cardLabel || "Non renseigné"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Référence</span>
                        <span className="text-right font-medium text-slate-900">
                          {selectedReservationPaymentDetails.orderReference
                            || selectedReservationPaymentDetails.checkoutSessionId
                            || "Non renseignée"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedReservationPreorderItems.length > 0 ? (
                  <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Produits choisis</p>
                        <p className="text-sm text-slate-500">Précommande liée à cette réservation.</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {selectedReservationPreorderItems.map((item, index) => (
                        <div key={`${item.menuItemId || item.name}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{item.name}</p>
                              <p className="text-sm text-slate-500">
                                {item.quantity} x {formatCurrency(item.unitPrice) || "Prix indisponible"}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-slate-950">
                              {formatCurrency(item.totalPrice) || "Prix indisponible"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(selectedReservation || selectedTable) ? <Separator className="bg-slate-200" /> : null}

            {selectedReservation || selectedTable ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <CalendarClock className="h-4 w-4" />
                <span>Le drawer reste contextuel: il disparaît dès que vous fermez la sélection active.</span>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <DrawerFooter className="border-t border-slate-200 px-5 pb-5 pt-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {selectedReservationAssignedTableId ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => selectedReservation && onReleaseReservation(selectedReservation.id)}
              >
                Retirer de la table
              </Button>
            ) : null}
            {selectedTable ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => onSelectTable(selectedTable.id)}
              >
                Garder {selectedTable.table_number}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="rounded-2xl" onClick={onClearSelection}>
              Fermer la sélection
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
