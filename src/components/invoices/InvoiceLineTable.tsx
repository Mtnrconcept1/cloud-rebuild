import { useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { fr } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { InvoiceOperationDetailDialog, type InvoiceOperationTarget } from "@/components/invoices/InvoiceOperationDetailDialog";
import { cn } from "@/lib/utils";

export type InvoiceDetailLineType = "order" | "reservation";

export type InvoiceDetailSource =
  | "orders"
  | "zero_attente"
  | "chefs_table"
  | "flash_sales"
  | "anti_gaspi"
  | "other";

export type PayoutInvoiceDetailLine = {
  lineId: string;
  lineType: InvoiceDetailLineType;
  source: InvoiceDetailSource;
  reference: string;
  label: string;
  occurredAt: string;
  grossAmount: number;
  rateApplied: number;
  invoicedAmount: number;
  tokCoveredMiamzAmount?: number;
};

export type ReservationFeeInvoiceDetailLine = {
  reservationId: string;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  status: string;
  cancelledBy: string | null;
  cancellationReasonCode: string | null;
  billingFeeChf: number;
};

type InvoiceLineTableBaseProps = {
  className?: string;
  roundingDelta?: number | null;
};

type PayoutInvoiceLineTableProps = InvoiceLineTableBaseProps & {
  mode: "payout";
  lines: readonly PayoutInvoiceDetailLine[];
};

type ReservationFeeInvoiceLineTableProps = InvoiceLineTableBaseProps & {
  mode: "reservation_fees";
  lines: readonly ReservationFeeInvoiceDetailLine[];
};

export type InvoiceLineTableProps = PayoutInvoiceLineTableProps | ReservationFeeInvoiceLineTableProps;

const SOURCE_PRESENTATION: Record<InvoiceDetailSource, { label: string; className: string }> = {
  orders: { label: "Commande", className: "bg-slate-100 text-slate-700" },
  zero_attente: { label: "Zéro attente", className: "bg-cyan-100 text-cyan-700" },
  chefs_table: { label: "La Table du Chef", className: "bg-violet-100 text-violet-700" },
  flash_sales: { label: "Vente flash", className: "bg-amber-100 text-amber-700" },
  anti_gaspi: { label: "Anti-gaspi", className: "bg-emerald-100 text-emerald-700" },
  other: { label: "Autre", className: "bg-slate-100 text-slate-600" },
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number) {
  return `${formatAmount(value)} CHF`;
}

function formatPercentage(value: number) {
  return `${formatAmount(value * 100)} %`;
}

function formatDateTime(value: string) {
  const date = parseISO(value);
  if (!isValid(date)) return "-";
  return format(date, "dd/MM/yyyy HH:mm", { locale: fr });
}

function formatDate(value: string) {
  const date = parseISO(value);
  if (!isValid(date)) return "-";
  return format(date, "dd/MM/yyyy", { locale: fr });
}

function formatTime(value: string) {
  if (!value) return "-";
  const normalized = value.slice(0, 5);
  return normalized || "-";
}

function getFallbackReference(target: InvoiceOperationTarget) {
  return target.kind === "order"
    ? `CMD-${target.id.slice(0, 8)}`
    : `RES-${target.id.slice(0, 8)}`;
}

function getLineAmount(props: InvoiceLineTableProps, line: PayoutInvoiceDetailLine | ReservationFeeInvoiceDetailLine) {
  return props.mode === "payout"
    ? (line as PayoutInvoiceDetailLine).invoicedAmount
    : (line as ReservationFeeInvoiceDetailLine).billingFeeChf;
}

function AmountDetail({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/30 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 break-words text-sm", emphasized && "font-semibold text-foreground")}>{value}</p>
    </div>
  );
}

export function InvoiceLineTable(props: InvoiceLineTableProps) {
  const [selectedOperation, setSelectedOperation] = useState<InvoiceOperationTarget | null>(null);
  const total = props.lines.reduce((sum, line) => sum + getLineAmount(props, line), 0);

  return (
    <div className={cn("space-y-3", props.className)}>
      <div className="space-y-2">
        {props.lines.map((line) => {
          if (props.mode === "payout") {
            const payoutLine = line as PayoutInvoiceDetailLine;
            const source = SOURCE_PRESENTATION[payoutLine.source] || SOURCE_PRESENTATION.other;
            const target: InvoiceOperationTarget = {
              kind: payoutLine.lineType,
              id: payoutLine.lineId,
              reference: payoutLine.reference || "",
            };
            const displayReference = payoutLine.reference || getFallbackReference(target);
            const tokCoveredMiamzAmount = Math.max(0, Number(payoutLine.tokCoveredMiamzAmount || 0));

            return (
              <div key={payoutLine.lineId} className="rounded-xl border bg-background p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("border-none", source.className)}>
                        {source.label}
                      </Badge>
                      {tokCoveredMiamzAmount > 0 ? (
                        <Badge className="border-none bg-fuchsia-100 text-fuchsia-800">Miamz Tok</Badge>
                      ) : null}
                    </div>
                    <div>
                      <p className="break-words font-medium">{payoutLine.label}</p>
                      <button
                        type="button"
                        onClick={() => setSelectedOperation(target)}
                        className="mt-1 break-all text-left text-xs font-medium text-primary underline-offset-4 transition hover:underline"
                      >
                        {displayReference}
                      </button>
                    </div>
                  </div>
                  <div className="shrink-0 lg:text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Montant facturé</p>
                    <p className="mt-1 text-base font-semibold">{formatCurrency(payoutLine.invoicedAmount)}</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <AmountDetail label="Date / heure" value={formatDateTime(payoutLine.occurredAt)} />
                  <AmountDetail label="Base nette" value={formatCurrency(payoutLine.grossAmount)} />
                  <AmountDetail label="Taux" value={formatPercentage(payoutLine.rateApplied)} />
                  <AmountDetail label="Facture" value={formatCurrency(payoutLine.invoicedAmount)} emphasized />
                </div>

                {tokCoveredMiamzAmount > 0 ? (
                  <div className="mt-3 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-fuchsia-900">Miamz pris en charge par Tok</span>
                      <span className="font-semibold text-fuchsia-900">{formatCurrency(tokCoveredMiamzAmount)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }

          const reservationLine = line as ReservationFeeInvoiceDetailLine;
          const target: InvoiceOperationTarget = {
            kind: "reservation",
            id: reservationLine.reservationId,
            reference: `RES-${reservationLine.reservationId.slice(0, 8)}`,
          };

          return (
            <div key={reservationLine.reservationId} className="rounded-xl border bg-background p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reservation</p>
                  <button
                    type="button"
                    onClick={() => setSelectedOperation(target)}
                    className="mt-1 break-all font-mono text-sm text-primary underline-offset-4 transition hover:underline"
                  >
                    {target.reference}
                  </button>
                </div>
                <div className="shrink-0 lg:text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Montant</p>
                  <p className="mt-1 text-base font-semibold">{formatCurrency(reservationLine.billingFeeChf)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <AmountDetail label="Date" value={formatDate(reservationLine.reservationDate)} />
                <AmountDetail label="Heure" value={formatTime(reservationLine.reservationTime)} />
                <AmountDetail label="Couverts" value={String(reservationLine.partySize)} />
                <AmountDetail label="Statut" value={reservationLine.status || "-"} />
                <AmountDetail label="Montant" value={formatCurrency(reservationLine.billingFeeChf)} emphasized />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1 rounded-xl border bg-muted/30 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="font-medium text-muted-foreground">Total</span>
        <span className="font-semibold">{formatCurrency(total)}</span>
      </div>
      {typeof props.roundingDelta === "number" && Math.abs(props.roundingDelta) >= 0.005 ? (
        <p className="text-xs text-muted-foreground">
          Ecart d&apos;arrondi: {props.roundingDelta > 0 ? "+" : ""}
          {formatCurrency(props.roundingDelta)}
        </p>
      ) : null}
      <InvoiceOperationDetailDialog
        target={selectedOperation}
        open={!!selectedOperation}
        onOpenChange={(open) => {
          if (!open) setSelectedOperation(null);
        }}
      />
    </div>
  );
}
