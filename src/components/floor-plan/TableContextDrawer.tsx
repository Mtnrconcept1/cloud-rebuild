import { ArrowUpRight, CalendarClock, CreditCard, Phone, Receipt, Star, Table2, UserRound } from "lucide-react";
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
import { cn } from "@/lib/utils";

import { FLOOR_PLAN_TONE_CLASS } from "./floorPlanTones";
import ReservationServiceActions from "./ReservationServiceActions";
import {
  type ReservationPlacementScore,
  type ReservationDropState,
  type ServiceDraftTable,
  type ServiceReservation,
  type ServiceReservationActionStatus,
  getReservationCustomerLabel,
  getReservationSpecialRequest,
  getReservationStatusTone,
  getServiceReservationStatusLabel,
  getSafeTime,
  getShortDateLabel,
  isZeroAttenteReservation,
  isActiveServiceReservation,
} from "./serviceShared";

type ReservationPaymentDetails = {
  isPaid: boolean | null;
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
  onOpenReservationDetails?: (reservationId: string) => void;
  onReservationStatusChange?: (reservationId: string, status: ServiceReservationActionStatus) => void;
  pendingReservationStatusId?: string | null;
  mutationsDisabled?: boolean;
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
  onOpenReservationDetails,
  onReservationStatusChange,
  pendingReservationStatusId = null,
  mutationsDisabled = false,
  preferredTableId,
  onSetPreferredTable,
  preferredTablePending = false,
}: TableContextDrawerProps) {
  const isActiveReservation = !!selectedReservation && isActiveServiceReservation(selectedReservation);
  const writesDisabled = mutationsDisabled || pendingReservationStatusId !== null;
  const alternativeTables = isActiveReservation ? compatibleTables.filter(({ table }) => (
    table.id !== selectedReservationAssignedTableId && table.is_active && table.capacity > 0 && table.layout.kind === "table"
  )) : [];
  const availableReservations = compatibleReservations.filter(isActiveServiceReservation);
  const specialRequest = selectedReservationSpecialRequest
    || (selectedReservation ? getReservationSpecialRequest(selectedReservation) : null);
  const customerPhone = selectedReservation?.customer?.phone?.trim();
  const phoneDigits = customerPhone?.replace(/[^\d+]/g, "");
  const telephoneHref = phoneDigits && /^\+?\d{3,}$/.test(phoneDigits) ? `tel:${phoneDigits}` : null;
  const title = selectedReservation && selectedTable
    ? `${selectedTable.table_number} · ${getReservationCustomerLabel(selectedReservation)}`
    : selectedTable
      ? selectedTable.table_number
      : selectedReservation
        ? getReservationCustomerLabel(selectedReservation)
        : "Contexte service";
  const compatibleTablesSummary = getShortListLabel(
    alternativeTables.slice(1).map(({ table, placement }) => `${table.table_number} (${placement.score}/100)`),
    "Aucune table",
  );
  const compatibleReservationsSummary = getShortListLabel(
    availableReservations.map((reservation) => `${getReservationCustomerLabel(reservation)} ${getSafeTime(reservation.time)}`),
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
    ? `${selectedReservationPaymentDetails.isPaid === true ? "Payé" : selectedReservationPaymentDetails.isPaid === false ? "À régler" : "À vérifier"} · ${formatCurrency(selectedReservationPaymentDetails.totalAmount) || "Montant inconnu"}`
    : "Aucun paiement";
  const bestCompatibleTable = alternativeTables[0] || null;

  // « Attitrer » se lit depuis la table où le client est effectivement posé :
  // c'est le geste naturel du service. À défaut, la table sélectionnée.
  const habitTable = selectedReservationAssignedTable
    ?? (selectedTableIsReservable ? selectedTable : null);
  const isHabitTablePreferred = !!habitTable && preferredTableId === habitTable.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)] max-w-[960px] flex-col gap-0 overflow-hidden rounded-[28px] border border-border bg-background p-0 shadow-2xl sm:max-h-[min(760px,calc(100dvh-2rem))] sm:rounded-[28px]">
        <DialogHeader className="shrink-0 px-5 pb-2 pt-5 pr-12 text-left sm:px-6 sm:pr-12">
          <DialogTitle className="text-xl text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selectedReservation
              ? isActiveReservation ? "Placement, arrivée et informations du client." : "Historique de la réservation et informations du client."
              : "Choisissez un client ou consultez les réservations de cette table."}
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
                            {getServiceReservationStatusLabel(selectedReservation.status)}
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

                    {customerPhone ? (
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {telephoneHref
                          ? <a href={telephoneHref} className="break-all font-medium text-primary underline-offset-4 hover:underline">{customerPhone}</a>
                          : <span className="break-all text-foreground">{customerPhone}</span>}
                      </div>
                    ) : null}
                    {specialRequest ? (
                      <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted px-3 py-2 text-sm">
                        <p className="font-semibold text-foreground">Demande du client</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{specialRequest}</p>
                      </div>
                    ) : null}
                    <ReservationServiceActions
                      key={selectedReservation.id}
                      reservation={selectedReservation}
                      onStatusChange={onReservationStatusChange}
                      pendingReservationStatusId={pendingReservationStatusId}
                      disabled={mutationsDisabled || (selectedReservation.status === "arrived" && !selectedReservationAssignedTableId)}
                      className="mt-3"
                    />
                    {isActiveReservation && selectedReservation.status === "arrived" && !selectedReservationAssignedTableId ? (
                      <p className="mt-2 text-xs text-muted-foreground">Choisissez une table avant d’installer le client.</p>
                    ) : null}
                    {isActiveReservation && ["arrived", "seated"].includes(selectedReservation.status || "") && onOpenReservationDetails ? (
                      <p className="mt-3 text-xs text-muted-foreground">Pour clôturer le service, ouvrez la réservation.</p>
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
                            ? `${selectedTableAssignments.length} réservation(s) sur cette table pour ce service.`
                            : "Aucune réservation sur cette table pour ce service."}
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
                      <Badge className={cn("border", FLOOR_PLAN_TONE_CLASS.orange)}>{selectedReservationAssignedTableId ? "Changer de table" : "Table recommandée"}</Badge>
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
                    disabled={writesDisabled}
                    aria-label={`Placer ${getReservationCustomerLabel(selectedReservation)} à ${bestCompatibleTable.table.table_number}`}
                    onClick={() => onAssignReservationToTable(selectedReservation.id, bestCompatibleTable.table.id)}
                  >
                    Placer à {bestCompatibleTable.table.table_number}
                  </Button>
                </div>
              </div>
            ) : null}

            <Accordion type="multiple" className="grid gap-3">
              {selectedReservation && alternativeTables.length > 1 ? (
                <CompactSection
                  value="compatible-tables"
                  icon={<Table2 className="h-4 w-4" />}
                  title="Autres tables compatibles"
                  subtitle="Suggestions immédiates pour placer cette réservation."
                  summary={compatibleTablesSummary}
                >
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {alternativeTables.slice(1).map(({ table, placement }) => (
                      <Button
                        key={table.id}
                        type="button"
                        variant="outline"
                        className="h-auto justify-between gap-3 rounded-2xl border-border px-4 py-3 text-left"
                        disabled={writesDisabled}
                        aria-label={`Placer ${getReservationCustomerLabel(selectedReservation)} à ${table.table_number}`}
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

              {selectedTable && selectedTableIsReservable && (!selectedReservation || isActiveReservation) && availableReservations.length > 0 ? (
                <CompactSection
                  value="compatible-reservations"
                  icon={<UserRound className="h-4 w-4" />}
                  title="Réservations compatibles"
                  subtitle="Touchez une réservation pour l'affecter à cette table."
                  summary={compatibleReservationsSummary}
                >
                  <div className="grid gap-2">
                    {availableReservations.map((reservation) => (
                      <Button
                        key={reservation.id}
                        type="button"
                        variant="outline"
                        className="h-auto justify-between rounded-2xl border-border px-4 py-3 text-left"
                        disabled={writesDisabled || !selectedTable.is_active}
                        aria-label={`Placer ${getReservationCustomerLabel(reservation)} à ${selectedTable.table_number}`}
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
                  title="Planning de la table"
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
                        <span className="min-w-0 font-medium text-foreground">{getReservationCustomerLabel(reservation)}</span>
                        <span className="shrink-0 text-right text-sm text-muted-foreground">
                          {getSafeTime(reservation.time)}
                          <span className="mt-0.5 block text-xs">{getServiceReservationStatusLabel(reservation.status)}</span>
                        </span>
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
                      selectedReservationPaymentDetails.isPaid === true
                        ? FLOOR_PLAN_TONE_CLASS.emerald
                        : selectedReservationPaymentDetails.isPaid === false ? FLOOR_PLAN_TONE_CLASS.amber : FLOOR_PLAN_TONE_CLASS.neutral,
                    )}>
                      {selectedReservationPaymentDetails.isPaid === true ? "Payé" : selectedReservationPaymentDetails.isPaid === false ? "À régler" : "Paiement à vérifier"}
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

          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 pb-4 pt-3 sm:px-6">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {isActiveReservation && selectedReservation && selectedTable && selectedTableIsReservable
              && selectedTable.id !== selectedReservationAssignedTableId && selectedTable.id !== bestCompatibleTable?.table.id ? (
              <Button
                type="button"
                className="h-auto min-h-10 whitespace-normal rounded-xl"
                aria-label={`Placer ${getReservationCustomerLabel(selectedReservation)} à ${selectedTable.table_number}`}
                onClick={() => onAssignReservationToTable(selectedReservation.id, selectedTable.id)}
                disabled={writesDisabled || !selectedTable.is_active || !selectedPairDropState?.ok}
              >
                {selectedPairDropState?.ok
                  ? `Placer à ${selectedTable.table_number}`
                  : selectedPairDropState?.reason || "Affectation impossible"}
              </Button>
            ) : null}
            {isActiveReservation && habitTable && selectedReservation?.user_id && onSetPreferredTable ? (
              <Button
                type="button"
                variant={isHabitTablePreferred ? "secondary" : "outline"}
                className="h-auto min-h-10 whitespace-normal rounded-xl"
                disabled={writesDisabled || preferredTablePending}
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
            {isActiveReservation && selectedReservationAssignedTableId ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-10 rounded-xl"
                disabled={writesDisabled}
                onClick={() => selectedReservation && onReleaseReservation(selectedReservation.id)}
              >
                Retirer de la table
              </Button>
            ) : null}
            {selectedReservation && onOpenReservationDetails ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-10 rounded-xl"
                onClick={() => onOpenReservationDetails(selectedReservation.id)}
              >
                Voir la réservation
                <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="min-h-10 rounded-xl" onClick={onClearSelection}>
              Fermer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
