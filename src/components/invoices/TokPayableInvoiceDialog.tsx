import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabase } from "@/integrations/supabase/client";
import {
  buildPayableInvoiceDocumentData,
  isPayableInvoiceType,
  type PayableInvoiceLine,
  type PayableInvoiceRow,
  type PayableInvoiceType,
} from "@/lib/payableInvoice";
import { TokPayableInvoiceDocument } from "./TokPayableInvoiceDocument";

const supabase = getSupabase();

type TokPayableInvoiceDialogProps = {
  invoice: PayableInvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return error ? String(error) : "Une erreur inconnue est survenue.";
}

function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePayableLines(
  invoiceType: PayableInvoiceType,
  rows: Array<Record<string, unknown>> | null | undefined,
) {
  if (invoiceType === "reservation_fees") {
    return (rows || []).map((row) => {
      const reservationDate = String(row.reservation_date || "");
      const reservationTime = String(row.reservation_time || "00:00:00");
      const billingFee = toAmount(row.billing_fee_chf);

      return {
        lineId: `legacy-${String(row.reservation_id || "")}`,
        itemKind: "reservation_fee",
        sourceTable: "reservations",
        sourceId: String(row.reservation_id || "") || null,
        sourceLabel: String(row.reservation_id || "") || null,
        occurredAt: reservationDate ? `${reservationDate}T${reservationTime}` : "",
        quantity: 1,
        unitAmount: billingFee,
        baseAmount: billingFee,
        rateLabel: `${billingFee.toFixed(2)} CHF / reservation`,
        rateValue: null,
        amountHt: billingFee,
        amountTva: 0,
        amountTtc: billingFee,
        metadata: {
          status: row.status || null,
          cancelled_by: row.cancelled_by || null,
          party_size: row.party_size || null,
          reservation_time: row.reservation_time || null,
          cancellation_reason_code: row.cancellation_reason_code || null,
        },
      } satisfies PayableInvoiceLine;
    });
  }

  return (rows || []).map((row) => ({
    lineId: String(row.line_id || ""),
    itemKind: String(row.item_kind || "manual_adjustment") as PayableInvoiceLine["itemKind"],
    sourceTable: row.source_table ? String(row.source_table) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceLabel: row.source_label ? String(row.source_label) : null,
    occurredAt: String(row.occurred_at || ""),
    quantity: toAmount(row.quantity) || 1,
    unitAmount: toAmount(row.unit_amount),
    baseAmount: toAmount(row.base_amount),
    rateLabel: row.rate_label ? String(row.rate_label) : null,
    rateValue: row.rate_value == null ? null : toAmount(row.rate_value),
    amountHt: toAmount(row.amount_ht),
    amountTva: toAmount(row.amount_tva),
    amountTtc: toAmount(row.amount_ttc),
    metadata: (row.metadata || {}) as PayableInvoiceLine["metadata"],
  })) satisfies PayableInvoiceLine[];
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openPrintWindow(title: string, content: string) {
  const nextWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!nextWindow) return false;

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join("\n");

  nextWindow.document.write(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    ${styles}
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        background: white;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .tok-print-shell {
        padding: 24px;
        background: white;
      }
      @page {
        size: A4;
        margin: 10mm;
      }
      @media print {
        .tok-print-shell {
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="tok-print-shell">${content}</div>
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 150);
      });
    </script>
  </body>
</html>`);
  nextWindow.document.close();

  return true;
}

function useTokPayableInvoiceDocumentData(invoice: PayableInvoiceRow | null, enabled: boolean) {
  return useQuery({
    queryKey: ["tok-payable-invoice-document", invoice?.id, invoice?.invoice_type, invoice?.restaurant_id],
    enabled: enabled && !!invoice,
    queryFn: async () => {
      if (!invoice) return null;
      if (!isPayableInvoiceType(invoice.invoice_type)) {
        throw new Error(`Type de facture non pris en charge: ${String(invoice.invoice_type)}`);
      }

      const linesPromise = invoice.invoice_type === "payable"
        ? supabase.rpc("get_payable_invoice_lines", { p_invoice_id: invoice.id })
        : supabase.rpc("get_reservation_fee_invoice_lines", { p_invoice_id: invoice.id });

      const [linesResponse, restaurantResponse, settingsResponse] = await Promise.all([
        linesPromise,
        supabase
          .from("restaurants")
          .select("name, legal_name, address, city, phone")
          .eq("id", invoice.restaurant_id)
          .single(),
        supabase
          .from("restaurant_invoice_settings")
          .select("company_name, company_address, company_postal_code, company_city, company_country, vat_number, siret, email, phone")
          .eq("restaurant_id", invoice.restaurant_id)
          .maybeSingle(),
      ]);

      if (linesResponse.error) throw linesResponse.error;
      if (restaurantResponse.error) throw restaurantResponse.error;
      if (settingsResponse.error) throw settingsResponse.error;

      const lines = normalizePayableLines(
        invoice.invoice_type,
        (linesResponse.data || []) as Array<Record<string, unknown>>,
      );

      return buildPayableInvoiceDocumentData({
        invoice,
        lines,
        restaurant: restaurantResponse.data,
        settings: settingsResponse.data,
      });
    },
  });
}

export function TokPayableInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: TokPayableInvoiceDialogProps) {
  const documentRef = useRef<HTMLDivElement | null>(null);
  const query = useTokPayableInvoiceDocumentData(invoice, open);
  const dialogTitle = useMemo(
    () => invoice?.invoice_number || invoice?.id.slice(0, 8) || "Facture TOK",
    [invoice],
  );

  const handlePrint = () => {
    if (!documentRef.current || !query.data) return;
    openPrintWindow(dialogTitle, documentRef.current.outerHTML);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] w-[calc(100vw-1rem)] max-w-[1240px] overflow-hidden rounded-[28px] border border-white/60 bg-[linear-gradient(180deg,rgba(250,250,249,0.98),rgba(244,246,250,0.98))] p-0 shadow-[0_40px_140px_-44px_rgba(15,23,42,0.48)]">
        <div className="flex h-full max-h-[96vh] flex-col">
          <DialogHeader className="border-b border-slate-200/80 px-6 py-5 text-left sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1 pr-8">
                <DialogTitle className="font-display text-2xl">Facture recue de TOK</DialogTitle>
                <DialogDescription>
                  Apercu admin/dashboard restaurateur de la facture payable canonique.
                </DialogDescription>
              </div>
              <Button onClick={handlePrint} disabled={!query.data}>
                <Download className="mr-2 h-4 w-4" />
                Imprimer / PDF
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6">
            {query.isLoading ? (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement de la facture...
              </div>
            ) : null}

            {!query.isLoading && query.error ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                Impossible de charger la facture. {getErrorMessage(query.error)}
              </div>
            ) : null}

            {!query.isLoading && !query.error && query.data ? (
              <TokPayableInvoiceDocument ref={documentRef} data={query.data} />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
