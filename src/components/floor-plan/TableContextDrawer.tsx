import { CalendarClock, CreditCard, Receipt, Star, Table2, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { FLOOR_PLAN_TONE_CLASS } from "./floorPlanTones";
import {
  type ReservationPlacementScore,
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
  compatibleTables: Array<{ table: ServiceDraftTable; placement: ReservationPlacementScore }>;
  compatibleReservations: ServiceReservation[];
  onOpenChange: (open: boolean) => void;
  onClearSelection: () => void;
  onAssignReservationToTable: (reservationId: string, tableId: string) => void;
  onReleaseReservation: (reservationId: string) => void;
  onSelectReservation: (reservationId: string) => void;
  onSelectTable: (tableId: string) => void;
  /** Table attitrée au client de la réservation affichée, s'il en a une. */
  preferredTableId?: string | null;
  /** `null` retire l'attribution. Absent = fonction indisponible (démo). */
  onSetPreferredTable?: (userId: string, tableId: string | null) => void;
  preferredTablePending?: boolean;
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

function getShortListLabel(values: string[], emptyLabel: string) {
  const safeValues = values.filter(Boolean);
  if (safeValues.length === 0) return emptyLabel;
  if (safeValues.length <= 2) return safeValues.join(", ");
  return `${safeValues.slice(0, 2).join(", ")} +${safeValues.length - 2}`;
}

function getPreorderTotal(items: ReservationPreorderItem[]) {
  let total = 0;
  let hasTotal = false;

  for (const item of items) {
    if (typeof item.totalPrice === "number" && Number.isFinite(item.totalPrice)) {
      total += item.totalPrice;
      hasTotal = true;
    }
  }

  return hasTotal ? total : null;
}

function CompactSection({
  value,
  icon,
  title,
  subtitle,
  summary,
  children,
}: {
  value: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="overflow-hidden rounded-[22px] border border-border bg-card px-4 shadow-sm">
      <AccordionTrigger className="py-3 text-left outline-none hover:no-underline focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0">
        <div className="flex min-w-0 flex-1 items-center gap-3 pr-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <span className="max-w-[42vw] truncate text-right text-xs font-semibold text-foreground sm:max-w-[220px]">
            {summary}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-2 pb-4 pt-0">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
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
  preferredTableId,
  onSetPreferredTable,
  preferredTablePending = false,
}: TableContextDrawerProps) {
  const title = selectedReservation && selectedTable
    ? `${selectedTable.table_number} · ${getReservationCustomerLabel(selectedReservation)}`
    : selectedTable
      ? `Table ${selectedTable.table_number}`
      : selectedReservation
        ? getReservationCustomerLabel(selectedReservation)
        : "Contexte service";
  const compatibleTablesSummary = getShortListLabel(
    compatibleTables.map(({ table, placement }) => `${table.table_number} (${placement.score}/100)`),
    "Aucune table",
  );
  const compatibleReservationsSummary = getShortListLabel(
    compatibleReservations.map((reservation) => `${getReservationCustomerLabel(reservation)} ${getSafeTime(reservation.time)}`),
    "Aucune suggestion",
  );
  const tableAssignmentsSummary = getShortListLabel(
    selectedTableAssignments.map((reservation) => `${getReservationCustomerLabel(reservation)} ${getSafeTime(reservation.time)}`),
    "Aucun planning",
  );
  const preorderTotal = getPreorderTotal(selectedReservationPreorderItems);
  const formattedPreorderTotal = formatCurrency(preorderTotal);
  const preorderSummary = selectedReservationPreorderItems.length > 0
    ? `${selectedReservationPreorderItems.length} produit(s)${formattedPreorderTotal ? ` · ${formattedPreorderTotal}` : ""}`
    : "Aucun produit";
  const paymentSummary = selectedReservationPaymentDetails
    ? `${selectedReservationPaymentDetails.isPaid ? "Payé" : "À régler"} · ${formatCurrency(selectedReservationPaymentDetails.totalAmount) || "Montant inconnu"}`
    : "Aucun paiement";
  const bestCompatibleTable = selectedReservation && compatibleTables.length > 0 ? compatibleTables[0] : null;

  // « Attitrer » se lit depuis la table où le client est effectivement posé :
  // c'est le geste naturel du service. À défaut, la table sélectionnée.
  const habitTable = selectedReservationAssignedTable
    ?? (selectedTableIsReservable ? selectedTable : null);
  const isHabitTablePreferred = !!habitTable && preferredTableId === habitTable.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)] max-w-[960px] flex-col gap-0 overflow-hidden rounded-[28px] border border-border bg-background p-0 shadow-2xl sm:max-h-[760px] sm:rounded-[28px]">
        <DialogHeader className="shrink-0 px-5 pb-2 pt-5 pr-12 text-left sm:px-6 sm:pr-12">
          <DialogTitle className="text-xl text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Actions rapides pour le service. La sélection active reste au premier plan sans inspecteur permanent.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 sm:px-6">
          <div className="space-y-3 pb-3">
            {(selectedReservation || selectedTable) ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {selectedReservation ? (
                  <div className="rounded-[22px] border border-border bg-card px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold text-foreground">
                            {getReservationCustomerLabel(selectedReservation)}
                          </p>
                          {isZeroAttenteReservation(selectedReservation) ? (
                            <Badge className={cn("border", FLOOR_PLAN_TONE_CLASS.teal)}>Zéro Attente</Badge>
                          ) : null}
                          {preferredTableId ? (
                            <Badge className={cn("gap-1 border", FLOOR_PLAN_TONE_CLASS.amber)}>
                              <Star className="h-3 w-3 fill-current" />
                              Habitué
                            </Badge>
                          ) : null}
                          <Badge className={cn("border", getReservationStatusTone(selectedReservation.status))}>
                            {selectedReservation.status || "pending"}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{getShortDateLabel(selectedReservation.date)}</span>
                          <span>{getSafeTime(selectedReservation.time)}</span>
                          <span>{selectedReservation.party_size} pers.</span>
                          {selectedReservationAssignedTable ? (
                            <Badge variant="outline" className="border-border bg-muted text-foreground">
                              {selectedReservationAssignedTable.table_number}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={cn(FLOOR_PLAN_TONE_CLASS.amber)}>
                              Sans table
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedReservationSpecialRequest ? (
                      <div className="mt-3 line-clamp-2 rounded-2xl border border-dashed border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {selectedReservationSpecialRequest}
                      </div>
                    ) : null}

                  </div>
                ) : null}

                {selectedTable ? (
                  <div className="rounded-[22px] border border-border bg-card px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                        <Table2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold text-foreground">{selectedTable.table_number}</p>
                          {selectedTableIsReservable ? (
                            <Badge variant="outline" className="border-border bg-muted text-foreground">
                              {selectedTable.capacity} couverts
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-border bg-muted text-foreground">
                              Mobilier
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
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

            {selectedReservation && bestCompatibleTable ? (
              <div className="rounded-[24px] border border-primary/25 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),hsl(var(--card)))] p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("border", FLOOR_PLAN_TONE_CLASS.orange)}>Table recommandee</Badge>
                      <Badge variant="outline" className="border-border bg-card text-foreground">
                        Score {bestCompatibleTable.placement.score}/100
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-2">
                      <p className="text-lg font-bold text-foreground">{bestCompatibleTable.table.table_number}</p>
                      <p className="text-sm text-muted-foreground">{bestCompatibleTable.table.capacity} couverts</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {bestCompatibleTable.placement.reasons.slice(0, 3).map((reason) => (
                        <span key={reason} className="rounded-full border border-primary/20 bg-card px-2 py-1 text-xs font-medium text-foreground">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="h-10 shrink-0 rounded-2xl"
                    aria-label={`Affecter table recommandee ${bestCompatibleTable.table.table_number}`}
                    onClick={() => onAssignReservationToTable(selectedReservation.id, bestCompatibleTable.table.id)}
                  >
                    Affecter {bestCompatibleTable.table.table_number}
                  </Button>
                </div>
              </div>
            ) : null}

            <Accordion type="multiple" className="grid gap-3">
              {selectedReservation && compatibleTables.length > 0 ? (
                <CompactSection
                  value="compatible-tables"
                  icon={<Table2 className="h-4 w-4" />}
                  title="Tables compatibles"
                  subtitle="Suggestions immédiates pour placer cette réservation."
                  summary={compatibleTablesSummary}
                >
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {compatibleTables.map(({ table, placement }) => (
                      <Button
                        key={table.id}
                        type="button"
                        variant="outline"
                        className="h-auto justify-between gap-3 rounded-2xl border-border px-4 py-3 text-left"
                        onClick={() => onAssignReservationToTable(selectedReservation.id, table.id)}
                      >
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-semibold">{table.table_number}</span>
                            <Badge variant="outline" className={cn("shrink-0", FLOOR_PLAN_TONE_CLASS.orange)}>
                              {placement.score}/100
                            </Badge>
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {placement.reasons[0] || `${table.capacity} couv.`}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{table.capacity} couv.</span>
                      </Button>
                    ))}
                  </div>
                </CompactSection>
              ) : null}

              {selectedTable && selectedTableIsReservable && compatibleReservations.length > 0 ? (
                <CompactSection
                  value="compatible-reservations"
                  icon={<UserRound className="h-4 w-4" />}
                  title="Réservations compatibles"
                  subtitle="Touchez une réservation pour l'affecter à cette table."
                  summary={compatibleReservationsSummary}
                >
                  <div className="grid gap-2">
                    {compatibleReservations.map((reservation) => (
                      <Button
                        key={reservation.id}
                        type="button"
                        variant="outline"
                        className="h-auto justify-between rounded-2xl border-border px-4 py-3 text-left"
                        onClick={() => onAssignReservationToTable(reservation.id, selectedTable.id)}
                      >
                        <span className="font-semibold">{getReservationCustomerLabel(reservation)}</span>
                        <span className="text-xs text-muted-foreground">
                          {getSafeTime(reservation.time)} · {reservation.party_size} pers.
                        </span>
                      </Button>
                    ))}
                  </div>
                </CompactSection>
              ) : null}

              {selectedTable && selectedTableAssignments.length > 0 ? (
                <CompactSection
                  value="table-planning"
                  icon={<CalendarClock className="h-4 w-4" />}
                  title="Planning visible sur cette table"
                  subtitle="Réservations déjà liées à la table."
                  summary={tableAssignmentsSummary}
                >
                  <div className="grid gap-2">
                    {selectedTableAssignments.map((reservation) => (
                      <button
                        key={reservation.id}
                        type="button"
                        className="flex items-center justify-between rounded-2xl border border-border bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted"
                        onClick={() => onSelectReservation(reservation.id)}
                      >
                        <span className="font-medium text-foreground">{getReservationCustomerLabel(reservation)}</span>
                        <span className="text-sm text-muted-foreground">{getSafeTime(reservation.time)}</span>
                      </button>
                    ))}
                  </div>
                </CompactSection>
              ) : null}

              {selectedReservationPaymentDetails ? (
                <CompactSection
                  value="payment"
                  icon={<CreditCard className="h-4 w-4" />}
                  title="Paiement"
                  subtitle="Statut et instrument de paiement."
                  summary={paymentSummary}
                >
                  <div className="flex flex-wrap gap-2">
                    <Badge className={cn(
                      "border",
                      selectedReservationPaymentDetails.isPaid
                        ? FLOOR_PLAN_TONE_CLASS.emerald
                        : FLOOR_PLAN_TONE_CLASS.amber,
                    )}>
                      {selectedReservationPaymentDetails.isPaid ? "Payé" : "À régler"}
                    </Badge>
                    {selectedReservationPaymentDetails.paymentMethod ? (
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                        {selectedReservationPaymentDetails.paymentMethod}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>Montant</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(selectedReservationPaymentDetails.totalAmount) || "Non renseigné"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Instrument</span>
                      <span className="text-right font-medium text-foreground">
                        {selectedReservationPaymentDetails.cardLabel || "Non renseigné"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Référence</span>
                      <span className="text-right font-medium text-foreground">
                        {selectedReservationPaymentDetails.orderReference
                          || selectedReservationPaymentDetails.checkoutSessionId
                          || "Non renseignée"}
                      </span>
                    </div>
                  </div>
                </CompactSection>
              ) : null}

              {selectedReservationPreorderItems.length > 0 ? (
                <CompactSection
                  value="preorder"
                  icon={<Receipt className="h-4 w-4" />}
                  title="Produits choisis"
                  subtitle="Précommande liée à cette réservation."
                  summary={preorderSummary}
                >
                  <div className="space-y-2">
                    {selectedReservationPreorderItems.map((item, index) => (
                      <div key={`${item.menuItemId || item.name}-${index}`} className="rounded-2xl border border-border bg-muted px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.quantity} x {formatCurrency(item.unitPrice) || "Prix indisponible"}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-foreground">
                            {formatCurrency(item.totalPrice) || "Prix indisponible"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CompactSection>
              ) : null}
            </Accordion>

            {(selectedReservation || selectedTable) ? <Separator className="bg-border" /> : null}

            {selectedReservation || selectedTable ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                <span>La modale reste contextuelle: elle disparaît dès que vous fermez la sélection active.</span>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 pb-4 pt-3 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {selectedReservation && selectedTable && selectedTableIsReservable ? (
              <Button
                type="button"
                className="h-9 rounded-xl"
                onClick={() => onAssignReservationToTable(selectedReservation.id, selectedTable.id)}
                disabled={!selectedPairDropState?.ok}
              >
                {selectedPairDropState?.ok
                  ? `Affecter à ${selectedTable.table_number}`
                  : selectedPairDropState?.reason || "Affectation impossible"}
              </Button>
            ) : null}
            {habitTable && selectedReservation && onSetPreferredTable ? (
              <Button
                type="button"
                variant={isHabitTablePreferred ? "secondary" : "outline"}
                className="h-9 rounded-xl"
                disabled={preferredTablePending}
                onClick={() => onSetPreferredTable(
                  selectedReservation.user_id,
                  isHabitTablePreferred ? null : habitTable.id,
                )}
              >
                <Star className={cn("mr-2 h-4 w-4", isHabitTablePreferred && "fill-current")} />
                {isHabitTablePreferred
                  ? `Ne plus attitrer ${habitTable.table_number}`
                  : `Toujours ${habitTable.table_number} pour ce client`}
              </Button>
            ) : null}
            {selectedReservationAssignedTableId ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                onClick={() => selectedReservation && onReleaseReservation(selectedReservation.id)}
              >
                Retirer de la table
              </Button>
            ) : null}
            {selectedTable ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                onClick={() => onSelectTable(selectedTable.id)}
              >
                Garder {selectedTable.table_number}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="h-9 rounded-xl" onClick={onClearSelection}>
              Fermer la sélection
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
