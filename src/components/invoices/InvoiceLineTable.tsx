import { format, parseISO, isValid } from "date-fns";
import { fr } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  zero_attente: { label: "Zero attente", className: "bg-cyan-100 text-cyan-700" },
  chefs_table: { label: "Chef's Table", className: "bg-violet-100 text-violet-700" },
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

function getLineAmount(props: InvoiceLineTableProps, line: PayoutInvoiceDetailLine | ReservationFeeInvoiceDetailLine) {
  return props.mode === "payout"
    ? (line as PayoutInvoiceDetailLine).invoicedAmount
    : (line as ReservationFeeInvoiceDetailLine).billingFeeChf;
}

export function InvoiceLineTable(props: InvoiceLineTableProps) {
  const total = props.lines.reduce((sum, line) => sum + getLineAmount(props, line), 0);

  return (
    <div className={cn("space-y-3", props.className)}>
      <Table>
        <TableHeader>
          {props.mode === "payout" ? (
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Libelle</TableHead>
              <TableHead>Date / heure</TableHead>
              <TableHead className="text-right">Montant brut</TableHead>
              <TableHead className="text-right">Taux</TableHead>
              <TableHead className="text-right">Montant facture</TableHead>
            </TableRow>
          ) : (
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Heure</TableHead>
              <TableHead className="text-right">Couverts</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Montant</TableHead>
            </TableRow>
          )}
        </TableHeader>
        <TableBody>
          {props.lines.map((line) => {
            if (props.mode === "payout") {
              const payoutLine = line as PayoutInvoiceDetailLine;
              const source = SOURCE_PRESENTATION[payoutLine.source] || SOURCE_PRESENTATION.other;

              return (
                <TableRow key={payoutLine.lineId}>
                  <TableCell>
                    <Badge variant="outline" className={cn("border-none", source.className)}>
                      {source.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[24rem]">
                    <div className="font-medium">{payoutLine.label}</div>
                    {payoutLine.reference ? (
                      <div className="text-xs text-muted-foreground">{payoutLine.reference}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(payoutLine.occurredAt)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(payoutLine.grossAmount)}</TableCell>
                  <TableCell className="text-right">{formatPercentage(payoutLine.rateApplied)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(payoutLine.invoicedAmount)}</TableCell>
                </TableRow>
              );
            }

            const reservationLine = line as ReservationFeeInvoiceDetailLine;

            return (
              <TableRow key={reservationLine.reservationId}>
                <TableCell className="whitespace-nowrap text-sm">{formatDate(reservationLine.reservationDate)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatTime(reservationLine.reservationTime)}
                </TableCell>
                <TableCell className="text-right">{reservationLine.partySize}</TableCell>
                <TableCell className="text-sm">{reservationLine.status || "-"}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(reservationLine.billingFeeChf)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={props.mode === "payout" ? 5 : 4} className="text-right font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold">{formatCurrency(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      {typeof props.roundingDelta === "number" && Math.abs(props.roundingDelta) >= 0.005 ? (
        <p className="text-xs text-muted-foreground">
          Ecart d&apos;arrondi: {props.roundingDelta > 0 ? "+" : ""}
          {formatCurrency(props.roundingDelta)}
        </p>
      ) : null}
    </div>
  );
}
