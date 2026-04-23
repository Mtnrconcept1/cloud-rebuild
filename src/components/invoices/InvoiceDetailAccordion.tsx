import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { InvoiceLineTable, type PayoutInvoiceDetailLine, type ReservationFeeInvoiceDetailLine } from "./InvoiceLineTable";

type InvoiceDetailBaseProps = {
  loading?: boolean;
  error?: Error | string | null;
  invoiceAmountTtc: number | string | null | undefined;
  className?: string;
};

type PayoutInvoiceDetailAccordionProps = InvoiceDetailBaseProps & {
  mode: "payout";
  lines: readonly PayoutInvoiceDetailLine[];
};

type ReservationFeeInvoiceDetailAccordionProps = InvoiceDetailBaseProps & {
  mode: "reservation_fees";
  lines: readonly ReservationFeeInvoiceDetailLine[];
};

export type InvoiceDetailAccordionProps = PayoutInvoiceDetailAccordionProps | ReservationFeeInvoiceDetailAccordionProps;

function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  return `${new Intl.NumberFormat("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} CHF`;
}

function getErrorMessage(error: Error | string | null | undefined) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

export function InvoiceDetailAccordion(props: InvoiceDetailAccordionProps) {
  if (props.loading) {
    return <div className={props.className}>Chargement du detail...</div>;
  }

  const errorMessage = getErrorMessage(props.error);
  if (errorMessage) {
    return (
      <div className={props.className}>
        <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Impossible de charger le detail de facture. {errorMessage}
        </p>
      </div>
    );
  }

  if (!props.lines.length) {
    return <div className={props.className}>Aucune ligne sur cette facture.</div>;
  }

  const totalLines = props.lines.reduce((sum, line) => sum + ("invoicedAmount" in line ? line.invoicedAmount : line.billingFeeChf), 0);
  const roundingDelta = toAmount(props.invoiceAmountTtc) - totalLines;
  const hasRoundingDelta = Math.abs(roundingDelta) >= 0.005;

  if (props.mode === "reservation_fees") {
    return (
      <div className={props.className}>
        <Accordion type="single" collapsible defaultValue="reservations-facturees" className="w-full">
          <AccordionItem value="reservations-facturees" className="rounded-lg border px-4">
            <AccordionTrigger className="py-4 hover:no-underline">
              <div className="flex flex-1 items-center justify-between gap-3 text-left">
                <span className="font-medium">Reservations facturees</span>
                <span className="text-sm text-muted-foreground">{formatAmount(totalLines)}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <InvoiceLineTable mode="reservation_fees" lines={props.lines} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total des lignes</span>
          <span className="font-semibold">{formatAmount(totalLines)}</span>
        </div>
        {hasRoundingDelta ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Ecart d&apos;arrondi: {roundingDelta > 0 ? "+" : ""}
            {formatAmount(roundingDelta)}
          </p>
        ) : null}
      </div>
    );
  }

  const reservationLines = props.lines.filter((line) => line.lineType === "reservation");
  const orderLines = props.lines.filter((line) => line.lineType === "order");
  const reservationSubtotal = reservationLines.reduce((sum, line) => sum + line.invoicedAmount, 0);
  const orderSubtotal = orderLines.reduce((sum, line) => sum + line.invoicedAmount, 0);

  return (
    <div className={props.className}>
      <Accordion type="multiple" defaultValue={["reservations", "commandes"]} className="w-full space-y-3">
        <AccordionItem value="reservations" className="rounded-lg border px-4">
          <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex flex-1 items-center justify-between gap-3 text-left">
              <span className="font-medium">Reservations</span>
              <span className="text-sm text-muted-foreground">{formatAmount(reservationSubtotal)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <InvoiceLineTable mode="payout" lines={reservationLines} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="commandes" className="rounded-lg border px-4">
          <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex flex-1 items-center justify-between gap-3 text-left">
              <span className="font-medium">Commandes</span>
              <span className="text-sm text-muted-foreground">{formatAmount(orderSubtotal)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <InvoiceLineTable mode="payout" lines={orderLines} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Total des lignes</span>
        <span className="font-semibold">{formatAmount(totalLines)}</span>
      </div>
      {hasRoundingDelta ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Ecart d&apos;arrondi: {roundingDelta > 0 ? "+" : ""}
          {formatAmount(roundingDelta)}
        </p>
      ) : null}
    </div>
  );
}
